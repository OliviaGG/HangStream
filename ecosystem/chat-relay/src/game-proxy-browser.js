'use strict';

function buildGameFetchProxyInject(gameId) {
  if (!/^[a-z0-9_-]+$/i.test(gameId)) throw new Error('Invalid game proxy ID');
  return `<script>(function(){` +
    `var prefix=${JSON.stringify('/game/' + gameId)};` +
    `function hubPath(p){return p.startsWith("/api/me")||p.startsWith("/api/auth")||p.startsWith("/auth/")||p.startsWith("/api/library")||p.startsWith("/api/sp-");}` +
    `function hubUrl(u){` +
    `if(typeof u!=="string")return u;` +
    `try{var v=new URL(u,location.href);` +
    `var p=v.pathname;if(p.startsWith(prefix+"/")&&hubPath(p.slice(prefix.length)))p=p.slice(prefix.length);` +
    `if(hubPath(p)&&(v.origin===location.origin||["https://wordtycoon.live","https://www.wordtycoon.live","https://wordgame.live","https://www.wordgame.live"].indexOf(v.origin)!==-1))` +
    `return p+v.search+v.hash;}catch(_){}return u;}` +
    `function rewriteUrl(u){u=hubUrl(u);` +
    `if(typeof u==="string"&&u.charAt(0)==="/"&&!u.startsWith("//")&&!u.startsWith("/game/")&&!hubPath(u))return prefix+u;return u;}` +
    `var _fetch=window.fetch;window.fetch=function(u,o){` +
    `if(typeof URL!=="undefined"&&u instanceof URL)u=u.href;` +
    `if(typeof Request!=="undefined"&&u instanceof Request){var v=rewriteUrl(u.url);if(v!==u.url)u=new Request(new URL(v,location.href).href,u);}` +
    `else u=rewriteUrl(u);return _fetch.call(this,u,o)};` +
    // Visibility/session checks in older games use XMLHttpRequest. Only hub
    // URLs are normalized here; their Socket.IO transport owns its game path.
    `if(window.XMLHttpRequest){var _open=window.XMLHttpRequest.prototype.open;window.XMLHttpRequest.prototype.open=function(m,u){var a=Array.prototype.slice.call(arguments);a[1]=hubUrl(typeof URL!=="undefined"&&u instanceof URL?u.href:u);return _open.apply(this,a)};}` +
    `var _ES=window.EventSource;window.EventSource=function(u,o){return new _ES(rewriteUrl(u),o)};` +
    `window.EventSource.prototype=_ES.prototype;window.EventSource.CONNECTING=_ES.CONNECTING;window.EventSource.OPEN=_ES.OPEN;window.EventSource.CLOSED=_ES.CLOSED;` +
    `})();</script>`;
}

module.exports = { buildGameFetchProxyInject };
