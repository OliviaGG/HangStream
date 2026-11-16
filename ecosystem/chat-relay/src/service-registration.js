'use strict';
function createServiceRegistration({ policy, sockets, apps, authorizeBot, changed = () => {} }) {
  function detach(socket) {
    authorizeBot(socket, null);
    const id = socket._appId;
    if (id) {
      socket.leave(id);
      if (sockets.get(id) === socket) {
        sockets.delete(id); apps.setReachable(id, false); changed();
      }
    }
    socket._appId = null;
    socket._servicePrincipal = null;
  }
  function register(socket, data) {
    detach(socket);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { success: false, error: 'Invalid registration' };
    const principal = policy.register(data.apiKey, data);
    if (!principal) return { success: false, error: 'Service issuer or app identity rejected' };
    if (principal.id === 'discord-bot' && !authorizeBot(socket, data)) return { success: false, error: 'Discord command credential required' };
    const old = [...sockets.values()].filter(value => value !== socket && value._servicePrincipal?.id === principal.id);
    socket._appId = data.id;
    socket._servicePrincipal = principal;
    sockets.set(data.id, socket);
    apps.setReachable(data.id, true);
    socket.leave('dashboard'); socket.join(data.id);
    // A replacement is installed before the previous transport disconnects, so
    // its disconnect handler cannot erase the new registry entry.
    for (const previous of old) { detach(previous); previous.disconnect(true); }
    changed();
    return { success: true, id: data.id };
  }
  function active(socket) {
    return !!socket._appId && sockets.get(socket._appId) === socket && policy.active(socket._servicePrincipal);
  }
  function ownsGame(socket, game) { return active(socket) && policy.ownsGame(socket._servicePrincipal, game); }
  function revokeInactive() {
    let revoked = 0;
    for (const socket of [...sockets.values()]) {
      if (!active(socket)) { detach(socket); socket.disconnect(true); revoked++; }
    }
    return revoked;
  }
  return { register, detach, active, ownsGame, revokeInactive };
}
module.exports = { createServiceRegistration };
