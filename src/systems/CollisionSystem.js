export class CollisionSystem {
  // Returns the first ghost colliding with player, or null
  static check(player, ghosts) {
    if (!player.alive) return null;

    for (const ghost of ghosts) {
      if (!ghost.alive) continue;

      const dx = player.x - ghost.x;
      const dy = player.y - ghost.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDist = player.radius + ghost.radius;  // sum of radii

      if (distance < minDist) {
        return ghost;
      }
    }
    return null;
  }
}
