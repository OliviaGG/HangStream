(function (global) {
  'use strict';

  function sanitizeName(value, maxLength) {
    var limit = Number.isFinite(maxLength) ? maxLength : 20;
    return String(value || '')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);
  }

  function getBaseUrl(options) {
    if (options && typeof options.baseUrl === 'string' && options.baseUrl) return options.baseUrl;
    var location = global.location || {};
    if (location.port && location.origin) return location.origin;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return location.origin || 'http://127.0.0.1:3020';
    }
    if (location.hostname === 'subtextle.com' || location.hostname === 'www.subtextle.com') {
      return 'https://wordtycoon.live';
    }
    return 'https://wordtycoon.live';
  }

  function showError(input, message) {
    if (!input) return;
    input.setCustomValidity(message || 'That username is not allowed.');
    input.reportValidity();
    global.setTimeout(function () {
      input.setCustomValidity('');
    }, 50);
  }

  async function validateValue(value, options) {
    var config = options || {};
    var sanitize = typeof config.sanitize === 'function'
      ? config.sanitize
      : function (name) { return sanitizeName(name, config.maxLength); };
    var sanitized = sanitize(value, config.maxLength);
    if (!sanitized) {
      return {
        ok: false,
        valid: false,
        sanitized: '',
        message: config.emptyMessage || 'Enter a username.'
      };
    }

    try {
      var response = await global.fetch(getBaseUrl(config) + '/api/username/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sanitized,
          maxLength: config.maxLength || 20,
          minLength: config.minLength || 1
        })
      });

      var data = null;
      try {
        data = await response.json();
      } catch (parseError) {
        data = null;
      }

      if (response.ok && data && data.valid) {
        return {
          ok: true,
          valid: true,
          sanitized: data.sanitized || sanitized
        };
      }

      return {
        ok: false,
        valid: false,
        sanitized: sanitized,
        message: (data && (data.message || data.error)) || 'That username is not allowed.'
      };
    } catch (error) {
      return {
        ok: false,
        valid: false,
        sanitized: sanitized,
        message: 'Username validation unavailable.'
      };
    }
  }

  async function validateInput(input, options) {
    return validateValue(input && typeof input.value === 'string' ? input.value : '', options);
  }

  global.WordTycoonGuestNameValidation = {
    sanitize: sanitizeName,
    getBaseUrl: getBaseUrl,
    showError: showError,
    validateInput: validateInput,
    validateValue: validateValue
  };
})(window);
