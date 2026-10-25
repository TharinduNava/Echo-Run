export class CollisionSystem {
  // Returns the first harmful echo colliding with the player, or null
  static check(player, ghosts) {
    if (!player.alive) return null;

    for (const ghost of ghosts) {
      if (!ghost.harmful) continue;  // skips materializing, expiring and dead echoes

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
