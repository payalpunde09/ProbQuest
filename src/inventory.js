/**
 * ============================================================================
 * INVENTORY SYSTEM
 * ============================================================================
 * Tracks probability items: COINS, DICE, CARDS, KEYS
 */
export class InventoryManager {
  constructor() {
    this.items = {
      coins: {
        id: 'coins',
        name: 'COINS',
        count: 150,
        unit: 'Gold',
        icon: '🪙',
        color: '#fbbf24',
        desc: 'Fair & Biased Probability Coins for Bernoulli Trials',
      },
      dice: {
        id: 'dice',
        name: 'DICE',
        count: 4,
        unit: 'Dice',
        icon: '🎲',
        color: '#f87171',
        desc: 'Standard D6 & Polyhedral Dice for Uniform Distributions',
      },
      cards: {
        id: 'cards',
        name: 'CARDS',
        count: 12,
        unit: 'Cards',
        icon: '🃏',
        color: '#38bdf8',
        desc: 'Standard Playing Deck Cards for Permutations & Combinations',
      },
      keys: {
        id: 'keys',
        name: 'KEYS',
        count: 2,
        unit: 'Keys',
        icon: '🗝️',
        color: '#a855f7',
        desc: 'Enchanted Keys to unlock Probability Chambers & Vaults',
      },
    };

    this.listeners = new Set();
  }

  getItems() {
    return Object.values(this.items);
  }

  getItem(id) {
    return this.items[id] || null;
  }

  addItem(id, amount = 1) {
    if (this.items[id]) {
      this.items[id].count += amount;
      this.notify();
    }
  }

  useItem(id, amount = 1) {
    if (this.items[id] && this.items[id].count >= amount) {
      this.items[id].count -= amount;
      this.notify();
      return true;
    }
    return false;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach((fn) => fn(this.getItems()));
  }
}
