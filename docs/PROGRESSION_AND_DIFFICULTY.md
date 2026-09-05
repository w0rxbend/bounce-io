# Progression and altitude difficulty

Local play and the authoritative Go server use the same progression contract. Each XP level presents three cards, with the first choice guaranteed affordable whenever an affordable unlocked card exists. Common cards are free; rare and epic cards remain coin sinks.

## Skill tree

The tree has five readable branches. Tier 1 establishes a play style; tiers 2 and 3 require both player level and stacks in their parent skill.

- Stamina: faster combat recovery, then Quick Strike and Shockwave Hit.
- Wind: Wind Resistance, then stronger air control.
- Jump: High Jump, Spring Legs, Double Jump, and Dash.
- Shield: a small regenerating core, then Energy Shield and Last Stand.
- Fortune: Gold Keeper, pickup range, collectible XP, and kill XP.

Core caps prevent runaway builds: Stamina reaches 30% cooldown reduction, Wind Resistance 50%, and Gold Keeper a 45% deterministic bonus-reward chance. High Jump and shield values share the same derived-stat formulas in both modes.

## Pacing

XP requirements follow a hybrid linear/quadratic curve rather than exponential growth. Enemy XP rises with altitude and caps, so later combat remains worthwhile without making farming unbounded.

Altitude introduces pressure in layers: early regions teach routes, then hazards, wind, and more demanding enemies enter progressively. A per-chunk challenge budget caps simultaneous hazards, enemies, and wind. Those pressures cannot occupy the same platform, and mandatory safe-route wind is reserved for late difficulty. Region-start checkpoints are calm recovery beats with no enemies, hazards, or wind.

Enemies scale primarily from altitude rather than the player's level. Higher bands shorten telegraphs and recovery modestly and increase chase pressure, while preserving a visible windup and active attack window.
