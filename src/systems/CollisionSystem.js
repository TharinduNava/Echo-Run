export class CollisionSystem {
  // Returns the first ghost colliding with player, or null
  static check(player, ghosts) {
    if (!player.alive) return null;

    for (const ghost of ghosts) {
      if (!ghost.alive) continue;

      const dx = player.x - ghost.x;
      const dy = player.y - ghost.y;
      const minDist = player.radius + ghost.radius;

      if (dx * dx + dy * dy < minDist * minDist) {
        return ghost;
      }
    }
    return null;
  }
}
