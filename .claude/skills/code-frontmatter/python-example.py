"""
---
purpose: Genetic algorithm for Fantasy Premier League team optimisation
inputs: players: list[Player], budget: float, generations: int, population_size: int
outputs:
  - team: list[Player] - optimal 15-player squad
  - fitness: float - predicted total points for the team
related:
  - ./fitness.py - calculates expected points for a squad
  - ./constraints.py - validates squad rules (3-5-5-3 formation etc)
  - ./player.py - Player dataclass definition
tags:
  - optimisation
  - fpl
  - genetic-algorithm
---
"""

from dataclasses import dataclass
from typing import List, Tuple
import numpy as np
import random

from .player import Player
from .fitness import calculate_fitness
from .constraints import is_valid_squad


@dataclass
class GAConfig:
    """Configuration for the genetic algorithm."""
    population_size: int = 100
    generations: int = 500
    mutation_rate: float = 0.1
    crossover_rate: float = 0.8
    elite_size: int = 5


def create_random_squad(players: List[Player], budget: float) -> List[Player]:
    """Generate a random valid 15-player squad within budget."""
    squad = []
    remaining_budget = budget
    
    # Simplified: select players greedily by position
    positions = {'GKP': 2, 'DEF': 5, 'MID': 5, 'FWD': 3}
    
    for position, count in positions.items():
        available = [p for p in players 
                     if p.position == position 
                     and p.price <= remaining_budget
                     and p not in squad]
        selected = random.sample(available, min(count, len(available)))
        squad.extend(selected)
        remaining_budget -= sum(p.price for p in selected)
    
    return squad


def crossover(parent1: List[Player], parent2: List[Player]) -> List[Player]:
    """Single-point crossover between two squads."""
    point = random.randint(1, len(parent1) - 1)
    child = parent1[:point] + [p for p in parent2 if p not in parent1[:point]]
    return child[:15]


def mutate(squad: List[Player], all_players: List[Player], rate: float) -> List[Player]:
    """Randomly swap players with probability `rate`."""
    mutated = squad.copy()
    for i in range(len(mutated)):
        if random.random() < rate:
            position = mutated[i].position
            candidates = [p for p in all_players 
                          if p.position == position and p not in mutated]
            if candidates:
                mutated[i] = random.choice(candidates)
    return mutated


def run_ga(
    players: List[Player],
    budget: float = 100.0,
    generations: int = 500,
    config: GAConfig = None
) -> Tuple[List[Player], float]:
    """
    Run genetic algorithm to find optimal FPL squad.
    
    Args:
        players: Available player pool
        budget: Maximum squad cost
        generations: Number of iterations
        config: Optional GA configuration
    
    Returns:
        Tuple of (best_squad, fitness_score)
    """
    if config is None:
        config = GAConfig(generations=generations)
    
    # Initialise population
    population = [
        create_random_squad(players, budget) 
        for _ in range(config.population_size)
    ]
    
    best_squad = None
    best_fitness = 0
    
    for gen in range(config.generations):
        # Evaluate fitness
        scored = [(squad, calculate_fitness(squad)) for squad in population]
        scored.sort(key=lambda x: x[1], reverse=True)
        
        # Track best
        if scored[0][1] > best_fitness:
            best_squad = scored[0][0]
            best_fitness = scored[0][1]
        
        # Selection (tournament)
        selected = [s[0] for s in scored[:config.elite_size]]
        
        while len(selected) < config.population_size:
            tournament = random.sample(scored, 5)
            winner = max(tournament, key=lambda x: x[1])[0]
            selected.append(winner)
        
        # Crossover and mutation
        next_gen = scored[:config.elite_size]  # Elitism
        
        while len(next_gen) < config.population_size:
            if random.random() < config.crossover_rate:
                p1, p2 = random.sample(selected, 2)
                child = crossover(p1, p2)
            else:
                child = random.choice(selected).copy()
            
            child = mutate(child, players, config.mutation_rate)
            
            if is_valid_squad(child, budget):
                next_gen.append((child, 0))
        
        population = [s[0] for s in next_gen]
    
    return best_squad, best_fitness
