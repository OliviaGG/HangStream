'use strict';
const { isIP } = require('node:net');
function cleanIP(value) {
  return typeof value === 'string' && value.length <= 64 && isIP(value.trim()) ? value.trim() : null;
}
function clientAddress({ headers, remoteAddress } = {}) {
  const peer = cleanIP(remoteAddress);
  // Only the local Nginx connection may supply X-Real-IP. Nginx overwrites
  // this header with its verified remote peer; client-provided CF/XFF headers
  // do not override it. Direct connections retain their actual peer address.
  if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) {
    return cleanIP(headers?.['x-real-ip']) || peer;
  }
  return peer;
}
function socketClientAddress(socket) {
  return clientAddress({ headers: socket?.handshake?.headers,
    remoteAddress: socket?.request?.socket?.remoteAddress || socket?.conn?.remoteAddress || socket?.handshake?.address });
}
function requestClientAddress(req) {
  return clientAddress({ headers: req?.headers, remoteAddress: req?.socket?.remoteAddress || req?.connection?.remoteAddress });
}
module.exports = { clientAddress, socketClientAddress, requestClientAddress };
