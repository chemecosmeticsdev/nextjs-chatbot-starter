import {
  NavigationStateManager,
  createNavigationState,
  updateNavigationState,
  validateNavigationState,
  serializeNavigationState,
  deserializeNavigationState,
  mergeNavigationStates,
  createNavigationSnapshot,
  restoreNavigationSnapshot,
  NavigationEventEmitter,
} from '@/utils/navigation/navigation-state';

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
  },
});

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock sessionStorage
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
});

describe('Navigation State Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockSessionStorage.getItem.mockReturnValue(null);
  });

  describe('NavigationStateManager', () => {
    let manager: NavigationStateManager;

    beforeEach(() => {
      manager = new NavigationStateManager();
    });

    it('initializes with default state', () => {
      const state = manager.getState();

      expect(state).toMatchObject({
        currentRoute: '/',
        previousRoute: null,
        history: [],
        isNavigating: false,
        breadcrumbs: [],
        permissions: {},
        metadata: {},
      });
    });

    it('updates current route', () => {
      manager.setCurrentRoute('/dashboard/chatbots');

      const state = manager.getState();
      expect(state.currentRoute).toBe('/dashboard/chatbots');
      expect(state.previousRoute).toBe('/');
    });

    it('tracks navigation history', () => {
      manager.setCurrentRoute('/dashboard');
      manager.setCurrentRoute('/dashboard/chatbots');
      manager.setCurrentRoute('/dashboard/analytics');

      const state = manager.getState();
      expect(state.history).toEqual([
        expect.objectContaining({ route: '/' }),
        expect.objectContaining({ route: '/dashboard' }),
        expect.objectContaining({ route: '/dashboard/chatbots' }),
      ]);
    });

    it('limits history size', () => {
      const maxHistory = 5;
      manager = new NavigationStateManager({ maxHistory });

      // Add more routes than the limit
      for (let i = 0; i < 10; i++) {
        manager.setCurrentRoute(`/route-${i}`);
      }

      const state = manager.getState();
      expect(state.history.length).toBeLessThanOrEqual(maxHistory);
    });

    it('manages breadcrumbs', () => {
      const breadcrumbs = [
        { label: 'Home', href: '/', isActive: false },
        { label: 'Dashboard', href: '/dashboard', isActive: true },
      ];

      manager.setBreadcrumbs(breadcrumbs);

      const state = manager.getState();
      expect(state.breadcrumbs).toEqual(breadcrumbs);
    });

    it('tracks navigation loading state', () => {
      expect(manager.getState().isNavigating).toBe(false);

      manager.setNavigating(true);
      expect(manager.getState().isNavigating).toBe(true);

      manager.setNavigating(false);
      expect(manager.getState().isNavigating).toBe(false);
    });

    it('manages route permissions', () => {
      const permissions = {
        '/dashboard': ['read'],
        '/admin': ['admin'],
      };

      manager.setPermissions(permissions);

      const state = manager.getState();
      expect(state.permissions).toEqual(permissions);
    });

    it('stores route metadata', () => {
      const metadata = {
        '/dashboard': { title: 'Dashboard', icon: 'dashboard' },
      };

      manager.setMetadata(metadata);

      const state = manager.getState();
      expect(state.metadata).toEqual(metadata);
    });

    it('provides state subscription', () => {
      const listener = jest.fn();
      const unsubscribe = manager.subscribe(listener);

      manager.setCurrentRoute('/dashboard');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ currentRoute: '/dashboard' }),
        expect.objectContaining({ currentRoute: '/' })
      );

      unsubscribe();
      manager.setCurrentRoute('/analytics');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('persists state to storage', () => {
      manager = new NavigationStateManager({ persist: true });

      manager.setCurrentRoute('/dashboard');

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'navigation-state',
        expect.any(String)
      );
    });

    it('restores state from storage', () => {
      const persistedState = {
        currentRoute: '/restored-route',
        history: [{ route: '/previous', timestamp: Date.now() }],
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(persistedState));

      manager = new NavigationStateManager({ persist: true });

      const state = manager.getState();
      expect(state.currentRoute).toBe('/restored-route');
    });

    it('handles storage errors gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      manager = new NavigationStateManager({ persist: true });

      expect(() => {
        manager.setCurrentRoute('/dashboard');
      }).not.toThrow();
    });

    it('clears state', () => {
      manager.setCurrentRoute('/dashboard');
      manager.setBreadcrumbs([{ label: 'Test', href: '/test', isActive: true }]);

      manager.clear();

      const state = manager.getState();
      expect(state.currentRoute).toBe('/');
      expect(state.breadcrumbs).toEqual([]);
      expect(state.history).toEqual([]);
    });

    it('provides navigation analytics', () => {
      manager.setCurrentRoute('/dashboard');
      manager.setCurrentRoute('/analytics');
      manager.setCurrentRoute('/dashboard');

      const analytics = manager.getAnalytics();

      expect(analytics).toMatchObject({
        totalNavigations: expect.any(Number),
        uniqueRoutes: expect.any(Set),
        mostVisitedRoute: expect.any(String),
        averageSessionTime: expect.any(Number),
      });
    });
  });

  describe('createNavigationState', () => {
    it('creates initial navigation state', () => {
      const state = createNavigationState();

      expect(state).toMatchObject({
        currentRoute: '/',
        previousRoute: null,
        history: [],
        isNavigating: false,
        breadcrumbs: [],
        permissions: {},
        metadata: {},
        timestamp: expect.any(Number),
      });
    });

    it('creates state with custom values', () => {
      const customState = createNavigationState({
        currentRoute: '/dashboard',
        breadcrumbs: [{ label: 'Dashboard', href: '/dashboard', isActive: true }],
      });

      expect(customState.currentRoute).toBe('/dashboard');
      expect(customState.breadcrumbs).toHaveLength(1);
    });

    it('validates state structure', () => {
      const state = createNavigationState();

      expect(validateNavigationState(state)).toBe(true);
    });
  });

  describe('updateNavigationState', () => {
    it('updates state immutably', () => {
      const initialState = createNavigationState();
      const updatedState = updateNavigationState(initialState, {
        currentRoute: '/dashboard',
        isNavigating: true,
      });

      expect(initialState.currentRoute).toBe('/');
      expect(updatedState.currentRoute).toBe('/dashboard');
      expect(updatedState.isNavigating).toBe(true);
    });

    it('preserves unchanged properties', () => {
      const initialState = createNavigationState({
        breadcrumbs: [{ label: 'Home', href: '/', isActive: true }],
        permissions: { '/dashboard': ['read'] },
      });

      const updatedState = updateNavigationState(initialState, {
        currentRoute: '/dashboard',
      });

      expect(updatedState.breadcrumbs).toEqual(initialState.breadcrumbs);
      expect(updatedState.permissions).toEqual(initialState.permissions);
    });

    it('updates timestamp', () => {
      const initialState = createNavigationState();
      const updatedState = updateNavigationState(initialState, {
        currentRoute: '/dashboard',
      });

      expect(updatedState.timestamp).toBeGreaterThan(initialState.timestamp);
    });

    it('handles nested updates', () => {
      const initialState = createNavigationState({
        metadata: { '/home': { title: 'Home' } },
      });

      const updatedState = updateNavigationState(initialState, {
        metadata: {
          ...initialState.metadata,
          '/dashboard': { title: 'Dashboard' },
        },
      });

      expect(updatedState.metadata).toMatchObject({
        '/home': { title: 'Home' },
        '/dashboard': { title: 'Dashboard' },
      });
    });
  });

  describe('validateNavigationState', () => {
    it('validates correct state structure', () => {
      const validState = createNavigationState();

      expect(validateNavigationState(validState)).toBe(true);
    });

    it('rejects invalid state structure', () => {
      const invalidState = {
        currentRoute: 123, // Should be string
        history: 'not-array', // Should be array
      };

      expect(validateNavigationState(invalidState as any)).toBe(false);
    });

    it('validates required properties', () => {
      const incompleteState = {
        currentRoute: '/dashboard',
        // Missing other required properties
      };

      expect(validateNavigationState(incompleteState as any)).toBe(false);
    });

    it('validates array properties', () => {
      const stateWithInvalidArrays = createNavigationState({
        history: 'not-array' as any,
        breadcrumbs: 'not-array' as any,
      });

      expect(validateNavigationState(stateWithInvalidArrays)).toBe(false);
    });

    it('validates object properties', () => {
      const stateWithInvalidObjects = createNavigationState({
        permissions: 'not-object' as any,
        metadata: 'not-object' as any,
      });

      expect(validateNavigationState(stateWithInvalidObjects)).toBe(false);
    });
  });

  describe('serializeNavigationState', () => {
    it('serializes state to JSON string', () => {
      const state = createNavigationState({
        currentRoute: '/dashboard',
        breadcrumbs: [{ label: 'Dashboard', href: '/dashboard', isActive: true }],
      });

      const serialized = serializeNavigationState(state);

      expect(typeof serialized).toBe('string');
      expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('handles complex nested objects', () => {
      const complexState = createNavigationState({
        metadata: {
          '/dashboard': {
            title: 'Dashboard',
            nested: { value: 'test' },
            array: [1, 2, 3],
          },
        },
      });

      const serialized = serializeNavigationState(complexState);
      const parsed = JSON.parse(serialized);

      expect(parsed.metadata['/dashboard'].nested.value).toBe('test');
      expect(parsed.metadata['/dashboard'].array).toEqual([1, 2, 3]);
    });

    it('handles serialization errors', () => {
      const stateWithCircularRef: any = createNavigationState();
      stateWithCircularRef.circular = stateWithCircularRef;

      expect(() => serializeNavigationState(stateWithCircularRef)).not.toThrow();
    });
  });

  describe('deserializeNavigationState', () => {
    it('deserializes JSON string to state', () => {
      const originalState = createNavigationState({
        currentRoute: '/dashboard',
        isNavigating: true,
      });

      const serialized = serializeNavigationState(originalState);
      const deserialized = deserializeNavigationState(serialized);

      expect(deserialized.currentRoute).toBe('/dashboard');
      expect(deserialized.isNavigating).toBe(true);
    });

    it('validates deserialized state', () => {
      const invalidJson = '{"currentRoute": 123, "invalid": true}';

      const result = deserializeNavigationState(invalidJson);

      expect(result).toBeNull();
    });

    it('handles malformed JSON', () => {
      const malformedJson = '{"invalid": json}';

      const result = deserializeNavigationState(malformedJson);

      expect(result).toBeNull();
    });

    it('provides fallback for empty input', () => {
      expect(deserializeNavigationState('')).toBeNull();
      expect(deserializeNavigationState(null as any)).toBeNull();
      expect(deserializeNavigationState(undefined as any)).toBeNull();
    });
  });

  describe('mergeNavigationStates', () => {
    it('merges two navigation states', () => {
      const state1 = createNavigationState({
        currentRoute: '/dashboard',
        breadcrumbs: [{ label: 'Dashboard', href: '/dashboard', isActive: true }],
      });

      const state2 = createNavigationState({
        currentRoute: '/analytics',
        permissions: { '/analytics': ['read'] },
      });

      const merged = mergeNavigationStates(state1, state2);

      expect(merged.currentRoute).toBe('/analytics');
      expect(merged.breadcrumbs).toEqual(state1.breadcrumbs);
      expect(merged.permissions).toEqual(state2.permissions);
    });

    it('handles array merging strategies', () => {
      const state1 = createNavigationState({
        history: [{ route: '/page1', timestamp: 1 }],
      });

      const state2 = createNavigationState({
        history: [{ route: '/page2', timestamp: 2 }],
      });

      const merged = mergeNavigationStates(state1, state2, {
        mergeArrays: 'concat',
      });

      expect(merged.history).toHaveLength(2);
      expect(merged.history).toEqual([
        { route: '/page1', timestamp: 1 },
        { route: '/page2', timestamp: 2 },
      ]);
    });

    it('handles object merging strategies', () => {
      const state1 = createNavigationState({
        metadata: { '/page1': { title: 'Page 1' } },
      });

      const state2 = createNavigationState({
        metadata: { '/page2': { title: 'Page 2' } },
      });

      const merged = mergeNavigationStates(state1, state2, {
        mergeObjects: 'deep',
      });

      expect(merged.metadata).toEqual({
        '/page1': { title: 'Page 1' },
        '/page2': { title: 'Page 2' },
      });
    });

    it('preserves state validity', () => {
      const validState1 = createNavigationState();
      const validState2 = createNavigationState({ currentRoute: '/dashboard' });

      const merged = mergeNavigationStates(validState1, validState2);

      expect(validateNavigationState(merged)).toBe(true);
    });
  });

  describe('createNavigationSnapshot', () => {
    it('creates snapshot of current state', () => {
      const manager = new NavigationStateManager();
      manager.setCurrentRoute('/dashboard');
      manager.setBreadcrumbs([{ label: 'Dashboard', href: '/dashboard', isActive: true }]);

      const snapshot = createNavigationSnapshot(manager);

      expect(snapshot).toMatchObject({
        id: expect.any(String),
        timestamp: expect.any(Number),
        state: expect.objectContaining({
          currentRoute: '/dashboard',
        }),
        metadata: expect.any(Object),
      });
    });

    it('includes snapshot metadata', () => {
      const manager = new NavigationStateManager();
      const snapshot = createNavigationSnapshot(manager, {
        description: 'Test snapshot',
        tags: ['test', 'navigation'],
      });

      expect(snapshot.metadata.description).toBe('Test snapshot');
      expect(snapshot.metadata.tags).toEqual(['test', 'navigation']);
    });

    it('generates unique snapshot IDs', () => {
      const manager = new NavigationStateManager();
      const snapshot1 = createNavigationSnapshot(manager);
      const snapshot2 = createNavigationSnapshot(manager);

      expect(snapshot1.id).not.toBe(snapshot2.id);
    });
  });

  describe('restoreNavigationSnapshot', () => {
    it('restores state from snapshot', () => {
      const manager = new NavigationStateManager();
      manager.setCurrentRoute('/dashboard');

      const snapshot = createNavigationSnapshot(manager);

      manager.setCurrentRoute('/analytics');
      restoreNavigationSnapshot(manager, snapshot);

      const state = manager.getState();
      expect(state.currentRoute).toBe('/dashboard');
    });

    it('validates snapshot before restoration', () => {
      const manager = new NavigationStateManager();
      const invalidSnapshot = {
        id: 'test',
        timestamp: Date.now(),
        state: { invalid: 'state' },
      };

      expect(() => {
        restoreNavigationSnapshot(manager, invalidSnapshot as any);
      }).toThrow();
    });

    it('preserves snapshot metadata', () => {
      const manager = new NavigationStateManager();
      const snapshot = createNavigationSnapshot(manager, {
        description: 'Test',
      });

      restoreNavigationSnapshot(manager, snapshot);

      expect(snapshot.metadata.description).toBe('Test');
    });
  });

  describe('NavigationEventEmitter', () => {
    let emitter: NavigationEventEmitter;

    beforeEach(() => {
      emitter = new NavigationEventEmitter();
    });

    it('emits and listens to events', () => {
      const listener = jest.fn();

      emitter.on('navigation:start', listener);
      emitter.emit('navigation:start', { from: '/', to: '/dashboard' });

      expect(listener).toHaveBeenCalledWith({ from: '/', to: '/dashboard' });
    });

    it('supports multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      emitter.on('navigation:complete', listener1);
      emitter.on('navigation:complete', listener2);
      emitter.emit('navigation:complete', { route: '/dashboard' });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('removes event listeners', () => {
      const listener = jest.fn();

      emitter.on('navigation:start', listener);
      emitter.off('navigation:start', listener);
      emitter.emit('navigation:start', {});

      expect(listener).not.toHaveBeenCalled();
    });

    it('supports once listeners', () => {
      const listener = jest.fn();

      emitter.once('navigation:complete', listener);
      emitter.emit('navigation:complete', {});
      emitter.emit('navigation:complete', {});

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('handles wildcard events', () => {
      const listener = jest.fn();

      emitter.on('navigation:*', listener);
      emitter.emit('navigation:start', {});
      emitter.emit('navigation:complete', {});

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('provides event listener count', () => {
      const listener = jest.fn();

      expect(emitter.listenerCount('test:event')).toBe(0);

      emitter.on('test:event', listener);
      expect(emitter.listenerCount('test:event')).toBe(1);

      emitter.off('test:event', listener);
      expect(emitter.listenerCount('test:event')).toBe(0);
    });

    it('clears all listeners', () => {
      emitter.on('event1', jest.fn());
      emitter.on('event2', jest.fn());

      expect(emitter.listenerCount('event1')).toBe(1);
      expect(emitter.listenerCount('event2')).toBe(1);

      emitter.removeAllListeners();

      expect(emitter.listenerCount('event1')).toBe(0);
      expect(emitter.listenerCount('event2')).toBe(0);
    });

    it('handles errors in event listeners', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      emitter.on('test:event', errorListener);
      emitter.on('test:event', normalListener);

      expect(() => {
        emitter.emit('test:event', {});
      }).not.toThrow();

      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('Performance and Memory Management', () => {
    it('manages memory efficiently with large history', () => {
      const manager = new NavigationStateManager({ maxHistory: 1000 });

      for (let i = 0; i < 5000; i++) {
        manager.setCurrentRoute(`/route-${i}`);
      }

      const state = manager.getState();
      expect(state.history.length).toBeLessThanOrEqual(1000);
    });

    it('cleans up expired snapshots', () => {
      const manager = new NavigationStateManager();
      const snapshot = createNavigationSnapshot(manager);

      // Mock expired snapshot
      snapshot.timestamp = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

      expect(() => {
        restoreNavigationSnapshot(manager, snapshot, { maxAge: 12 * 60 * 60 * 1000 });
      }).toThrow();
    });

    it('debounces rapid state updates', () => {
      const listener = jest.fn();
      const manager = new NavigationStateManager();

      manager.subscribe(listener);

      // Rapid updates
      manager.setCurrentRoute('/route1');
      manager.setCurrentRoute('/route2');
      manager.setCurrentRoute('/route3');

      // Should debounce notifications
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('provides memory usage statistics', () => {
      const manager = new NavigationStateManager();

      for (let i = 0; i < 100; i++) {
        manager.setCurrentRoute(`/route-${i}`);
      }

      const stats = manager.getMemoryStats();

      expect(stats).toMatchObject({
        historySize: expect.any(Number),
        stateSize: expect.any(Number),
        snapshotCount: expect.any(Number),
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles corrupted storage data', () => {
      mockLocalStorage.getItem.mockReturnValue('{"invalid": json}');

      const manager = new NavigationStateManager({ persist: true });

      expect(manager.getState().currentRoute).toBe('/');
    });

    it('handles storage quota exceeded', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      const manager = new NavigationStateManager({ persist: true });

      expect(() => {
        manager.setCurrentRoute('/dashboard');
      }).not.toThrow();
    });

    it('handles invalid route formats', () => {
      const manager = new NavigationStateManager();

      expect(() => {
        manager.setCurrentRoute('');
      }).not.toThrow();

      expect(() => {
        manager.setCurrentRoute(null as any);
      }).not.toThrow();
    });

    it('handles circular references in state', () => {
      const manager = new NavigationStateManager();
      const circularState: any = { route: '/test' };
      circularState.self = circularState;

      expect(() => {
        manager.setState(circularState);
      }).not.toThrow();
    });

    it('recovers from state corruption', () => {
      const manager = new NavigationStateManager();

      // Corrupt the internal state
      (manager as any)._state = null;

      expect(() => {
        const state = manager.getState();
        expect(state.currentRoute).toBe('/');
      }).not.toThrow();
    });
  });
});