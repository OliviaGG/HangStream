// Membership billing — ported from word-tycoon-ecosystem/src/membership.js.
//
// Adaptations for HangStream:
//   - discordUserId -> viewerId (the viewer_id cookie value, e.g. "google:...")
//   - db.* membership functions -> server/storage.js cache-backed helpers
//   - Stripe Price IDs come from STRIPE_PRICE_<TIER_ID> env vars when set;
//     otherwise checkout falls back to inline price_data from the tier's
//     priceUsd so no Stripe dashboard setup is required.
//   - No cosmetics/profile-logo/gift-coin grants (those systems don't exist
//     here). Perks flow through isActiveSubscriber()/isDonor() instead.
//   - Pookie Tok / hint-recharge one-time checkouts are Chat Relay features
//     with no HangStream equivalent; donations already cover one-time tips.
//   - The TikTok checkout custom field is collected but NOT auto-linked:
//     HangStream chat identities are numeric platform user IDs, not handles,
//     so a typed handle cannot be verified. Logged for manual linking.

const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');
const {
  getMembership,
  upsertMembership,
  getMembershipByStripeSubscription,
  getMembershipByStripeCustomer,
} = require('./storage');

const TIERS_PATH = path.join(__dirname, '..', 'data', 'membership-tiers.json');
const STRIPE_API_VERSION = '2026-02-25.clover';
const STRIPE_MANAGED_STATUSES = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete']);

// Accept word-tycoon tier names as aliases for the HangStream tiers.
const TIER_ALIASES = {
  free: 'free',
  donor: 'supporter',
  donor_class: 'supporter',
  donorclass: 'supporter',
  supporter: 'supporter',
  pookie: 'tycoon',
  pookie_pass: 'tycoon',
  pookiepass: 'tycoon',
  tycoon: 'tycoon',
  vip: 'tycoon',
};

let cachedConfig = null;
let stripeClient = null;
let stripeClientSecret = null;

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function trimToEmpty(value) {
  return hasText(value) ? value.trim() : '';
}

function cleanObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function toStripeMetadata(metadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && String(value).trim().length > 0)
      .map(([key, value]) => [key, String(value).trim()])
  );
}

function getPublicSiteUrl(fallbackOrigin) {
  const configured = trimToEmpty(process.env.PUBLIC_SITE_URL || process.env.APP_URL || process.env.CHAT_RELAY_PUBLIC_URL);
  if (configured) return configured.replace(/\/+$/, '');
  return trimToEmpty(fallbackOrigin) || `http://localhost:${process.env.PORT || 8080}`;
}

function getBillingConfig(origin) {
  const siteUrl = getPublicSiteUrl(origin);
  return {
    provider: 'stripe',
    apiVersion: STRIPE_API_VERSION,
    siteUrl,
    checkoutSuccessUrl: trimToEmpty(process.env.STRIPE_CHECKOUT_SUCCESS_URL) || `${siteUrl}/donate?checkout=success`,
    checkoutCancelUrl: trimToEmpty(process.env.STRIPE_CHECKOUT_CANCEL_URL) || `${siteUrl}/donate?checkout=cancelled`,
    membershipPortalUrl: trimToEmpty(process.env.STRIPE_PORTAL_RETURN_URL) || `${siteUrl}/donate`,
    webhookConfigured: hasText(process.env.STRIPE_WEBHOOK_SECRET),
  };
}

function loadTierConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = JSON.parse(fs.readFileSync(TIERS_PATH, 'utf8'));
    const tiers = Array.isArray(raw.tiers) ? raw.tiers : [];
    const byId = Object.fromEntries(tiers.map((tier) => [tier.id, tier]));
    cachedConfig = { tiers, byId };
  } catch (e) {
    console.error('[Membership] Failed to load tiers:', e.message);
    cachedConfig = { tiers: [], byId: {} };
  }
  return cachedConfig;
}

// Rank follows the tier order in membership-tiers.json (free first), so
// inserting a tier between others just works. vipLevel is display metadata.
function getTierRank(tier) {
  const id = normalizeTier(tier);
  const tiers = loadTierConfig().tiers;
  const idx = tiers.findIndex((t) => t.id === id);
  return idx === -1 ? 0 : idx;
}

function normalizeTier(tier) {
  const normalized = String(tier || 'free').trim().toLowerCase();
  const id = TIER_ALIASES[normalized] || normalized;
  return loadTierConfig().byId[id] ? id : 'free';
}

function getTierConfig(tier) {
  const config = loadTierConfig();
  return config.byId[normalizeTier(tier)] || config.byId.free || null;
}

function listTierConfigs() {
  return loadTierConfig().tiers.map((tier) => ({ ...tier }));
}

// Optional pre-created Stripe Price per tier: STRIPE_PRICE_SUPPORTER,
// STRIPE_PRICE_TYCOON, etc. When unset, checkout uses inline price_data.
function getStripePriceIdForTier(tier) {
  const normalizedTier = normalizeTier(tier);
  if (normalizedTier === 'free') return '';
  return trimToEmpty(process.env[`STRIPE_PRICE_${normalizedTier.toUpperCase()}`]);
}

function getTierForStripePriceId(priceId) {
  if (!hasText(priceId)) return 'free';
  const normalizedPriceId = priceId.trim();
  for (const tier of loadTierConfig().tiers) {
    if (tier.id !== 'free' && getStripePriceIdForTier(tier.id) === normalizedPriceId) {
      return tier.id;
    }
  }
  return 'free';
}

function isPremiumUnlocked(tier) {
  return !!getTierConfig(tier)?.premiumPassUnlocked;
}

function getCurrentPeriodKey(input = null) {
  const date = input ? new Date(input) : new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMembershipState(viewerId) {
  const membership = getMembership(viewerId);
  const tier = normalizeTier(membership ? membership.tier : 'free');
  const tierConfig = getTierConfig(tier);
  const status = String(membership ? membership.status : 'inactive').toLowerCase();
  const active = tier !== 'free' && (status === 'active' || status === 'trialing');
  return {
    ...(membership || {}),
    viewer_id: viewerId,
    tier,
    status,
    active,
    tierRank: getTierRank(tier),
    premiumPassUnlocked: active && isPremiumUnlocked(tier),
    monthlyGiftCoins: 0,
    tierConfig,
  };
}

function requireStripeClient() {
  const secretKey = trimToEmpty(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) {
    throw new Error('Stripe secret key is not configured');
  }
  if (!stripeClient || stripeClientSecret !== secretKey) {
    stripeClient = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
    stripeClientSecret = secretKey;
  }
  return stripeClient;
}

function toIsoTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function getSubscriptionItemPeriodValue(subscription, field) {
  const item = Array.isArray(subscription?.items?.data) ? subscription.items.data[0] : null;
  return item && Object.prototype.hasOwnProperty.call(item, field) ? item[field] : null;
}

function getInvoiceSubscriptionId(invoice) {
  if (hasText(invoice?.subscription)) return invoice.subscription.trim();

  const parentSubscription = invoice?.parent?.subscription_details?.subscription;
  if (hasText(parentSubscription)) return parentSubscription.trim();

  const lineSubscription = invoice?.lines?.data?.find((line) => {
    return hasText(line?.subscription) || hasText(line?.parent?.subscription_item_details?.subscription);
  });
  if (!lineSubscription) return '';

  return trimToEmpty(lineSubscription.subscription || lineSubscription.parent?.subscription_item_details?.subscription);
}

function getMetadataValue(metadata, keys) {
  if (!metadata || typeof metadata !== 'object') return '';
  for (const key of keys) {
    if (hasText(metadata[key])) return metadata[key].trim();
  }
  return '';
}

function extractViewerId(object) {
  if (!object || typeof object !== 'object') return '';
  return getMetadataValue(object.metadata, ['viewerId', 'viewer_id', 'discordUserId', 'discord_user_id'])
    || (hasText(object.client_reference_id) ? object.client_reference_id.trim() : '');
}

function extractTier(object) {
  if (!object || typeof object !== 'object') return 'free';

  const fromMetadata = getMetadataValue(object.metadata, ['tier', 'membershipTier', 'membership_tier']);
  if (fromMetadata) return normalizeTier(fromMetadata);

  const subscriptionPriceId = object.items?.data?.[0]?.price?.id;
  if (hasText(subscriptionPriceId)) return getTierForStripePriceId(subscriptionPriceId);

  const lineItemPriceId = object.lines?.data?.find((line) => hasText(line?.price?.id))?.price?.id;
  if (hasText(lineItemPriceId)) return getTierForStripePriceId(lineItemPriceId);

  return 'free';
}

async function ensureStripeCustomer({ viewerId, email, name }) {
  const stripe = requireStripeClient();
  const membership = getMembership(viewerId);
  const customerMetadata = toStripeMetadata({ viewerId });
  const trimmedEmail = trimToEmpty(email);
  const trimmedName = trimToEmpty(name);

  if (hasText(membership && membership.stripe_customer_id)) {
    try {
      const existingCustomer = await stripe.customers.retrieve(membership.stripe_customer_id);
      if (!existingCustomer.deleted) {
        const updates = {};
        if (trimmedEmail && existingCustomer.email !== trimmedEmail) updates.email = trimmedEmail;
        if (trimmedName && existingCustomer.name !== trimmedName) updates.name = trimmedName;
        if (getMetadataValue(existingCustomer.metadata, ['viewerId', 'viewer_id']) !== viewerId) {
          updates.metadata = customerMetadata;
        }
        if (Object.keys(updates).length > 0) {
          return stripe.customers.update(existingCustomer.id, cleanObject(updates));
        }
        return existingCustomer;
      }
    } catch (error) {
      console.warn(`[Membership] Failed to reuse Stripe customer ${membership.stripe_customer_id}: ${error.message}`);
    }
  }

  const createdCustomer = await stripe.customers.create(cleanObject({
    email: trimmedEmail || undefined,
    name: trimmedName || undefined,
    metadata: customerMetadata
  }));

  upsertMembership(viewerId, {
    tier: (membership && membership.tier) || 'free',
    status: (membership && membership.status) || 'inactive',
    stripe_customer_id: createdCustomer.id
  });

  return createdCustomer;
}

async function createCheckoutSession({ viewerId, tier, customerEmail, customerName, origin }) {
  const normalizedTier = normalizeTier(tier);
  if (normalizedTier === 'free') {
    throw new Error('Free Tier does not require checkout');
  }

  // Retired tiers can't be purchased; existing subscribers keep benefits.
  const tierConfig = getTierConfig(normalizedTier);
  if (tierConfig && tierConfig.retired) {
    const error = new Error(`${tierConfig.displayName || 'This membership'} is no longer available for purchase.`);
    error.code = 'tier_retired';
    throw error;
  }

  const membership = getMembershipState(viewerId);
  if (membership.stripe_subscription_id && STRIPE_MANAGED_STATUSES.has(membership.status)) {
    const error = new Error('Existing Stripe subscription must be managed in the billing portal');
    error.code = 'subscription_exists';
    try {
      const portal = await createPortalSession({ viewerId, origin });
      error.portalUrl = portal.url;
    } catch {
      error.portalUrl = '';
    }
    throw error;
  }

  const stripe = requireStripeClient();
  const customer = await ensureStripeCustomer({
    viewerId,
    email: customerEmail,
    name: customerName
  });

  const billing = getBillingConfig(origin);
  const priceId = getStripePriceIdForTier(normalizedTier);
  const metadata = toStripeMetadata({ viewerId, tier: normalizedTier });

  const lineItems = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(Number(tierConfig.priceUsd || 0) * 100),
          recurring: { interval: 'month' },
          product_data: {
            name: `HangStream ${tierConfig.displayName || normalizedTier}`,
            description: 'Unlock all game difficulties, chat hints, and donor perks.',
          },
        },
        quantity: 1,
      }];

  const session = await stripe.checkout.sessions.create(cleanObject({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer: customer.id,
    client_reference_id: viewerId,
    allow_promotion_codes: true,
    success_url: billing.checkoutSuccessUrl,
    cancel_url: billing.checkoutCancelUrl,
    // Optional TikTok handle collected on the Stripe-hosted page. Logged on
    // checkout completion for manual linking — chat perks key off numeric
    // platform user IDs, so a typed handle is unverified and never auto-grants.
    custom_fields: [{
      key: 'tiktok_username',
      label: { type: 'custom', custom: 'TikTok username' },
      type: 'text',
      optional: true,
      text: { maximum_length: 60 }
    }],
    line_items: lineItems,
    customer_update: { name: 'auto', address: 'auto' },
    metadata,
    subscription_data: {
      metadata,
    }
  }));

  upsertMembership(viewerId, {
    tier: membership.tier !== 'free' ? membership.tier : normalizedTier,
    status: membership.status || 'inactive',
    stripe_customer_id: customer.id
  });

  return {
    ok: true,
    tier: normalizedTier,
    url: session.url,
    sessionId: session.id
  };
}

async function createPortalSession({ viewerId, origin }) {
  const billing = getBillingConfig(origin);
  const membership = getMembership(viewerId);
  const customerId = trimToEmpty(membership && membership.stripe_customer_id);
  if (!customerId) {
    throw new Error('No Stripe customer is associated with this membership yet');
  }

  const stripe = requireStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: billing.membershipPortalUrl
  });

  return { ok: true, url: session.url };
}

async function grantMonthlyBenefits(viewerId, options = {}) {
  return {
    ok: true,
    granted: false,
    amount: 0,
    reason: 'no_monthly_grant',
    membership: getMembershipState(viewerId)
  };
}

function buildStripeMembershipEvent(subscription, overrides = {}) {
  const customer = subscription?.customer;
  const customerId = typeof customer === 'string' ? customer : customer?.id;
  const subscriptionTier = overrides.tier || extractTier(subscription);
  const viewerId = overrides.viewerId
    || extractViewerId(subscription)
    || (typeof customer === 'object' ? extractViewerId(customer) : '');
  const periodStart = subscription?.current_period_start ?? getSubscriptionItemPeriodValue(subscription, 'current_period_start');
  const periodEnd = subscription?.current_period_end ?? getSubscriptionItemPeriodValue(subscription, 'current_period_end');

  return {
    viewerId,
    tier: subscriptionTier,
    status: String(overrides.status || subscription?.status || 'inactive').toLowerCase(),
    stripeCustomerId: overrides.stripeCustomerId || customerId || '',
    stripeSubscriptionId: overrides.stripeSubscriptionId || subscription?.id || '',
    currentPeriodStart: overrides.currentPeriodStart || toIsoTimestamp(periodStart),
    currentPeriodEnd: overrides.currentPeriodEnd || toIsoTimestamp(periodEnd),
    cancelAtPeriodEnd: Object.prototype.hasOwnProperty.call(overrides, 'cancelAtPeriodEnd')
      ? !!overrides.cancelAtPeriodEnd
      : !!subscription?.cancel_at_period_end,
    grantBenefits: Object.prototype.hasOwnProperty.call(overrides, 'grantBenefits')
      ? overrides.grantBenefits
      : false
  };
}

async function syncMembershipFromStripeEvent(event = {}) {
  const viewerId = event.viewerId || event.viewer_id;
  if (!viewerId) {
    return { ok: false, message: 'Missing viewerId' };
  }

  const normalizedTier = normalizeTier(event.tier);
  const normalizedStatus = String(event.status || 'inactive').toLowerCase();
  const existing = getMembership(viewerId);
  const result = upsertMembership(viewerId, {
    tier: normalizedTier !== 'free' ? normalizedTier : ((existing && existing.tier !== 'free') ? existing.tier : 'supporter'),
    status: normalizedStatus,
    stripe_customer_id: event.stripeCustomerId || event.stripe_customer_id || (existing && existing.stripe_customer_id) || null,
    stripe_subscription_id: event.stripeSubscriptionId || event.stripe_subscription_id || (existing && existing.stripe_subscription_id) || null,
    current_period_start: event.currentPeriodStart || event.current_period_start || null,
    current_period_end: event.currentPeriodEnd || event.current_period_end || null,
    cancel_at_period_end: event.cancelAtPeriodEnd || event.cancel_at_period_end ? 1 : 0
  });

  if (!result.ok) return result;
  console.log(`[Membership] ${viewerId} -> ${normalizedTier} (${normalizedStatus})`);

  return {
    ok: true,
    membership: getMembershipState(viewerId),
    monthlyGrant: null
  };
}

function constructStripeWebhookEvent(rawBody, signature) {
  const webhookSecret = trimToEmpty(process.env.STRIPE_WEBHOOK_SECRET);
  if (!webhookSecret) {
    throw new Error('Stripe webhook secret is not configured');
  }
  if (!rawBody || !signature) {
    throw new Error('Missing Stripe webhook signature');
  }
  const stripe = requireStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

async function retrieveStripeSubscription(subscriptionId) {
  if (!hasText(subscriptionId)) return null;
  const stripe = requireStripeClient();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['customer', 'items.data.price']
  });
}

async function syncFromSubscriptionObject(subscription, overrides = {}) {
  let syncEvent = buildStripeMembershipEvent(subscription, overrides);
  if (!syncEvent.viewerId || syncEvent.tier === 'free') {
    try {
      const expandedSubscription = await retrieveStripeSubscription(subscription.id);
      if (expandedSubscription) {
        syncEvent = buildStripeMembershipEvent(expandedSubscription, overrides);
      }
    } catch (error) {
      console.warn(`[Membership] Failed to expand Stripe subscription ${subscription.id}: ${error.message}`);
    }
  }
  return syncMembershipFromStripeEvent(syncEvent);
}

async function handleStripeInvoicePaid(invoice) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return { ok: true, ignored: true };
  }

  const subscription = await retrieveStripeSubscription(subscriptionId);
  if (!subscription) return { ok: true, ignored: true };

  const syncEvent = buildStripeMembershipEvent(subscription, { grantBenefits: false });
  const syncResult = await syncMembershipFromStripeEvent(syncEvent);
  return {
    ok: true,
    syncResult,
    monthlyGrant: null
  };
}

// Pull the TikTok handle typed into the checkout page's custom field.
function extractCheckoutTiktokHandle(session) {
  const fields = Array.isArray(session?.custom_fields) ? session.custom_fields : [];
  const field = fields.find((f) => f?.key === 'tiktok_username');
  const raw = trimToEmpty(field?.text?.value).toLowerCase();
  if (!raw) return '';
  const urlMatch = raw.match(/tiktok\.com\/@?([a-z0-9._]+)/);
  const handle = (urlMatch ? urlMatch[1] : raw.replace(/^@+/, '')).replace(/[^a-z0-9._]/g, '');
  if (!handle || handle.length > 25) return '';
  return handle;
}

// Checkout completes -> log the typed TikTok handle for manual linking.
// Deliberately does NOT write linkedAccounts: chat guesses key off numeric
// platform user IDs, so an unverified handle cannot safely map to a chat
// identity. Logged so the owner can link it through the normal flow.
function logCheckoutTiktokHandle(session, viewerId) {
  const handle = extractCheckoutTiktokHandle(session);
  if (!handle || !hasText(viewerId)) return;
  console.log(`[Membership] Checkout TikTok handle @${handle} for ${viewerId} — verify and link manually if wanted`);
}

async function handleStripeWebhookEvent(event) {
  if (!event || !hasText(event.type)) {
    return { ok: false, message: 'Missing Stripe event type' };
  }

  const object = event.data && event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      // One-time payments (donations) are handled by the caller — this module
      // only owns subscription checkouts.
      if (object?.mode !== 'subscription' || !hasText(object?.subscription)) {
        return { ok: true, ignored: true };
      }
      const subscription = await retrieveStripeSubscription(object.subscription);
      if (!subscription) return { ok: true, ignored: true };
      const sessionTier = extractTier(object);
      const viewerId = extractViewerId(object) || extractViewerId(subscription);
      logCheckoutTiktokHandle(object, viewerId);
      return syncMembershipFromStripeEvent(buildStripeMembershipEvent(subscription, {
        viewerId,
        tier: sessionTier !== 'free' ? sessionTier : extractTier(subscription),
        stripeCustomerId: object.customer,
        grantBenefits: false
      }));
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return syncFromSubscriptionObject(object, { grantBenefits: false });
    case 'invoice.paid':
      return handleStripeInvoicePaid(object);
    case 'invoice.payment_failed': {
      if (!hasText(object?.subscription)) return { ok: true, ignored: true };
      const subscription = await retrieveStripeSubscription(object.subscription);
      if (!subscription) return { ok: true, ignored: true };
      return syncMembershipFromStripeEvent(buildStripeMembershipEvent(subscription, { grantBenefits: false }));
    }
    default:
      return { ok: true, ignored: true };
  }
}

function canAccessTier(requiredTier, currentTier) {
  if (!requiredTier) return true;
  return getTierRank(currentTier) >= getTierRank(requiredTier);
}

function getCheckoutUrlForTier(tier) {
  return getStripePriceIdForTier(tier);
}

function getManageSubscriptionUrl(origin) {
  return getBillingConfig(origin).membershipPortalUrl;
}

module.exports = {
  STRIPE_MANAGED_STATUSES,
  normalizeTier,
  getTierRank,
  getTierConfig,
  listTierConfigs,
  getBillingConfig,
  getStripePriceIdForTier,
  getTierForStripePriceId,
  getCheckoutUrlForTier,
  getManageSubscriptionUrl,
  isPremiumUnlocked,
  getCurrentPeriodKey,
  getMembershipState,
  grantMonthlyBenefits,
  createCheckoutSession,
  createPortalSession,
  constructStripeWebhookEvent,
  handleStripeWebhookEvent,
  syncMembershipFromStripeEvent,
  syncFromSubscriptionObject,
  retrieveStripeSubscription,
  buildStripeMembershipEvent,
  canAccessTier,
};
