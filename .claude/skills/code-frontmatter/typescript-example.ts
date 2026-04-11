/**
 * ---
 * purpose: Genetic algorithm for Fantasy Premier League team optimisation
 * inputs:
 *   - players: Player[] - Available player pool with stats
 *   - config: GAConfig - GA parameters (population, generations, rates)
 * outputs:
 *   - GAResult - Optimal squad, fitness score, and convergence generation
 * related:
 *   - ./fitness.ts - Calculates expected points for a squad
 *   - ./constraints.ts - Validates squad rules (formation, team limits)
 *   - ./player.ts - Player type definition
 * ---
 */

import { type Player, type Position } from './player';
import { calculateFitness } from './fitness';
import { isValidSquad } from './constraints';

export interface GAConfig {
  budget: number;
  populationSize: number;
  generations: number;
  mutationRate: number;
  crossoverRate: number;
  eliteSize: number;
}

export interface GAResult {
  squad: Player[];
  fitness: number;
  generation: number;
}

const DEFAULT_CONFIG: GAConfig = {
  budget: 100.0,
  populationSize: 100,
  generations: 500,
  mutationRate: 0.1,
  crossoverRate: 0.8,
  eliteSize: 5,
};

function createRandomSquad(players: Player[], budget: number): Player[] {
  const squad: Player[] = [];
  let remainingBudget = budget;

  const positionCounts: Record<Position, number> = {
    GKP: 2,
    DEF: 5,
    MID: 5,
    FWD: 3,
  };

  for (const [position, count] of Object.entries(positionCounts)) {
    const available = players.filter(
      (p) =>
        p.position === position &&
        p.price <= remainingBudget &&
        !squad.includes(p),
    );

    const selected = shuffleArray(available).slice(0, count);
    squad.push(...selected);
    remainingBudget -= selected.reduce((sum, p) => sum + p.price, 0);
  }

  return squad;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function crossover(parent1: Player[], parent2: Player[]): Player[] {
  const point = Math.floor(Math.random() * (parent1.length - 1)) + 1;
  const child = [
    ...parent1.slice(0, point),
    ...parent2.filter((p) => !parent1.slice(0, point).includes(p)),
  ];
  return child.slice(0, 15);
}

function mutate(squad: Player[], allPlayers: Player[], rate: number): Player[] {
  return squad.map((player) => {
    if (Math.random() < rate) {
      const candidates = allPlayers.filter(
        (p) => p.position === player.position && !squad.includes(p),
      );
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    return player;
  });
}

function tournamentSelect(
  scored: Array<{ squad: Player[]; fitness: number }>,
  tournamentSize: number = 5,
): Player[] {
  const tournament = shuffleArray(scored).slice(0, tournamentSize);
  return tournament.reduce((best, current) =>
    current.fitness > best.fitness ? current : best,
  ).squad;
}

export async function runGA(
  players: Player[],
  config: Partial<GAConfig> = {},
): Promise<GAResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Initialise population
  let population = Array.from({ length: cfg.populationSize }, () =>
    createRandomSquad(players, cfg.budget),
  );

  let bestSquad: Player[] = [];
  let bestFitness = 0;
  let bestGeneration = 0;

  for (let gen = 0; gen < cfg.generations; gen++) {
    // Evaluate fitness
    const scored = population.map((squad) => ({
      squad,
      fitness: calculateFitness(squad),
    }));

    scored.sort((a, b) => b.fitness - a.fitness);

    // Track best
    if (scored[0].fitness > bestFitness) {
      bestSquad = scored[0].squad;
      bestFitness = scored[0].fitness;
      bestGeneration = gen;
    }

    // Elitism - keep top performers
    const nextGen: Player[][] = scored
      .slice(0, cfg.eliteSize)
      .map((s) => s.squad);

    // Generate rest of population
    while (nextGen.length < cfg.populationSize) {
      let child: Player[];

      if (Math.random() < cfg.crossoverRate) {
        const p1 = tournamentSelect(scored);
        const p2 = tournamentSelect(scored);
        child = crossover(p1, p2);
      } else {
        child = [...tournamentSelect(scored)];
      }

      child = mutate(child, players, cfg.mutationRate);

      if (isValidSquad(child, cfg.budget)) {
        nextGen.push(child);
      }
    }

    population = nextGen;
  }

  return {
    squad: bestSquad,
    fitness: bestFitness,
    generation: bestGeneration,
  };
}
