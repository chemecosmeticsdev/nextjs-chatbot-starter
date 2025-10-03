import {
  isActiveRoute,
  buildUrl,
  parseRoute,
  validateRoute,
  getRouteParams,
  matchRoute,
  generateRouteId,
  getRouteHierarchy,
  normalizeRoute,
  getRoutePermissions,
  isRouteAccessible,
  getRouteMetadata,
} from '@/utils/navigation/route-helpers';

// Mock Next.js router
const mockRouter = {
  pathname: '/dashboard/chatbots/123/edit',
  asPath: '/dashboard/chatbots/123/edit?tab=settings',
  query: { id: '123', tab: 'settings' },
  push: jest.fn(),
  replace: jest.fn(),
};

jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

// Mock user context for permissions testing
const mockUser = {
  id: 'user-123',
  role: 'admin',
  permissions: ['read', 'write', 'delete'],
  organizationId: 'org-456',
};

describe('Route Helpers', () => {
  describe('isActiveRoute', () => {
    it('identifies exact route matches', () => {
      expect(isActiveRoute('/dashboard/chatbots/123/edit')).toBe(true);
      expect(isActiveRoute('/dashboard/chatbots/456/edit')).toBe(false);
      expect(isActiveRoute('/dashboard/analytics')).toBe(false);
    });

    it('handles partial route matching', () => {
      expect(isActiveRoute('/dashboard', { exact: false })).toBe(true);
      expect(isActiveRoute('/dashboard/chatbots', { exact: false })).toBe(true);
      expect(isActiveRoute('/different', { exact: false })).toBe(false);
    });

    it('ignores query parameters by default', () => {
      expect(isActiveRoute('/dashboard/chatbots/123/edit')).toBe(true);
    });

    it('includes query parameters when specified', () => {
      expect(isActiveRoute('/dashboard/chatbots/123/edit?tab=settings', {
        includeQuery: true
      })).toBe(true);

      expect(isActiveRoute('/dashboard/chatbots/123/edit?tab=general', {
        includeQuery: true
      })).toBe(false);
    });

    it('handles route patterns with wildcards', () => {
      expect(isActiveRoute('/dashboard/*/edit', { pattern: true })).toBe(true);
      expect(isActiveRoute('/dashboard/chatbots/*', { pattern: true })).toBe(true);
      expect(isActiveRoute('/admin/*', { pattern: true })).toBe(false);
    });

    it('handles regex patterns', () => {
      expect(isActiveRoute(/^\/dashboard\/\w+\/\d+\/edit$/, { regex: true })).toBe(true);
      expect(isActiveRoute(/^\/admin/, { regex: true })).toBe(false);
    });

    it('handles case sensitivity', () => {
      expect(isActiveRoute('/DASHBOARD/CHATBOTS/123/EDIT', {
        caseSensitive: false
      })).toBe(true);

      expect(isActiveRoute('/DASHBOARD/CHATBOTS/123/EDIT', {
        caseSensitive: true
      })).toBe(false);
    });
  });

  describe('buildUrl', () => {
    it('builds basic URLs', () => {
      expect(buildUrl('/dashboard')).toBe('/dashboard');
      expect(buildUrl('/dashboard', { section: 'analytics' }))
        .toBe('/dashboard?section=analytics');
    });

    it('builds URLs with parameters', () => {
      expect(buildUrl('/users/:id', { id: '123' }))
        .toBe('/users/123');

      expect(buildUrl('/users/:id/posts/:postId', {
        id: '123',
        postId: '456'
      })).toBe('/users/123/posts/456');
    });

    it('handles query parameters', () => {
      expect(buildUrl('/search', {}, { q: 'test', sort: 'date' }))
        .toBe('/search?q=test&sort=date');
    });

    it('combines path parameters and query parameters', () => {
      expect(buildUrl('/users/:id', { id: '123' }, { tab: 'profile' }))
        .toBe('/users/123?tab=profile');
    });

    it('handles special characters in parameters', () => {
      expect(buildUrl('/search', {}, { q: 'hello world', filter: 'type:pdf' }))
        .toBe('/search?q=hello%20world&filter=type%3Apdf');
    });

    it('handles array query parameters', () => {
      expect(buildUrl('/items', {}, { tags: ['javascript', 'react'] }))
        .toBe('/items?tags=javascript&tags=react');
    });

    it('removes undefined and null parameters', () => {
      expect(buildUrl('/test', {}, {
        defined: 'value',
        undefined: undefined,
        null: null,
        empty: ''
      })).toBe('/test?defined=value&empty=');
    });

    it('handles base URL configuration', () => {
      expect(buildUrl('/api/users', {}, {}, { baseUrl: 'https://api.example.com' }))
        .toBe('https://api.example.com/api/users');
    });
  });

  describe('parseRoute', () => {
    it('parses basic routes', () => {
      const parsed = parseRoute('/dashboard/chatbots/123/edit');

      expect(parsed).toEqual({
        pathname: '/dashboard/chatbots/123/edit',
        segments: ['dashboard', 'chatbots', '123', 'edit'],
        params: {},
        query: {},
        hash: '',
        isAbsolute: true,
      });
    });

    it('parses routes with query parameters', () => {
      const parsed = parseRoute('/search?q=test&sort=date&tags=js&tags=react');

      expect(parsed.query).toEqual({
        q: 'test',
        sort: 'date',
        tags: ['js', 'react'],
      });
    });

    it('parses routes with hash fragments', () => {
      const parsed = parseRoute('/docs/api#authentication');

      expect(parsed.hash).toBe('authentication');
      expect(parsed.pathname).toBe('/docs/api');
    });

    it('extracts dynamic parameters', () => {
      const parsed = parseRoute('/users/123/posts/456', '/users/:userId/posts/:postId');

      expect(parsed.params).toEqual({
        userId: '123',
        postId: '456',
      });
    });

    it('handles relative routes', () => {
      const parsed = parseRoute('relative/path');

      expect(parsed.isAbsolute).toBe(false);
      expect(parsed.segments).toEqual(['relative', 'path']);
    });

    it('handles complex query parameters', () => {
      const parsed = parseRoute('/api?filter[name]=test&filter[type]=user&sort=-createdAt');

      expect(parsed.query).toEqual({
        'filter[name]': 'test',
        'filter[type]': 'user',
        sort: '-createdAt',
      });
    });

    it('handles encoded parameters', () => {
      const parsed = parseRoute('/search?q=hello%20world&special=%21%40%23');

      expect(parsed.query).toEqual({
        q: 'hello world',
        special: '!@#',
      });
    });
  });

  describe('validateRoute', () => {
    it('validates correct route structure', () => {
      expect(validateRoute('/dashboard')).toBe(true);
      expect(validateRoute('/dashboard/chatbots')).toBe(true);
      expect(validateRoute('/')).toBe(true);
    });

    it('rejects invalid routes', () => {
      expect(validateRoute('')).toBe(false);
      expect(validateRoute('not-a-route')).toBe(false);
      expect(validateRoute('//double-slash')).toBe(false);
    });

    it('validates route patterns', () => {
      expect(validateRoute('/users/:id', { allowParams: true })).toBe(true);
      expect(validateRoute('/users/:id', { allowParams: false })).toBe(false);
    });

    it('validates query parameters', () => {
      expect(validateRoute('/search?q=test', { allowQuery: true })).toBe(true);
      expect(validateRoute('/search?q=test', { allowQuery: false })).toBe(false);
    });

    it('validates route depth', () => {
      const deepRoute = '/' + Array(10).fill('level').join('/');

      expect(validateRoute(deepRoute, { maxDepth: 5 })).toBe(false);
      expect(validateRoute(deepRoute, { maxDepth: 15 })).toBe(true);
    });

    it('validates against allowed patterns', () => {
      const allowedPatterns = [/^\/dashboard/, /^\/api\/v\d+/];

      expect(validateRoute('/dashboard/settings', { allowedPatterns })).toBe(true);
      expect(validateRoute('/api/v1/users', { allowedPatterns })).toBe(true);
      expect(validateRoute('/admin/users', { allowedPatterns })).toBe(false);
    });

    it('validates route security', () => {
      expect(validateRoute('/api/../../../etc/passwd', { checkTraversal: true })).toBe(false);
      expect(validateRoute('/normal/path', { checkTraversal: true })).toBe(true);
    });
  });

  describe('getRouteParams', () => {
    it('extracts parameters from current route', () => {
      const params = getRouteParams('/dashboard/chatbots/:id/edit');

      expect(params).toEqual({ id: '123' });
    });

    it('extracts multiple parameters', () => {
      const params = getRouteParams('/users/:userId/posts/:postId',
        '/users/123/posts/456');

      expect(params).toEqual({
        userId: '123',
        postId: '456',
      });
    });

    it('handles optional parameters', () => {
      const params = getRouteParams('/posts/:id/:slug?', '/posts/123');

      expect(params).toEqual({ id: '123', slug: undefined });
    });

    it('handles wildcard parameters', () => {
      const params = getRouteParams('/files/*path', '/files/docs/guide.pdf');

      expect(params).toEqual({ path: 'docs/guide.pdf' });
    });

    it('handles parameter constraints', () => {
      const params = getRouteParams('/users/:id(\\d+)', '/users/123');

      expect(params).toEqual({ id: '123' });

      const invalidParams = getRouteParams('/users/:id(\\d+)', '/users/abc');

      expect(invalidParams).toEqual({});
    });
  });

  describe('matchRoute', () => {
    it('matches exact routes', () => {
      expect(matchRoute('/dashboard', '/dashboard')).toBe(true);
      expect(matchRoute('/dashboard', '/different')).toBe(false);
    });

    it('matches parameterized routes', () => {
      expect(matchRoute('/users/:id', '/users/123')).toBe(true);
      expect(matchRoute('/users/:id', '/posts/123')).toBe(false);
    });

    it('matches multiple parameters', () => {
      expect(matchRoute('/users/:userId/posts/:postId', '/users/123/posts/456')).toBe(true);
      expect(matchRoute('/users/:userId/posts/:postId', '/users/123/comments/456')).toBe(false);
    });

    it('matches optional parameters', () => {
      expect(matchRoute('/posts/:id/:slug?', '/posts/123')).toBe(true);
      expect(matchRoute('/posts/:id/:slug?', '/posts/123/hello-world')).toBe(true);
    });

    it('matches wildcard routes', () => {
      expect(matchRoute('/files/*', '/files/docs/guide.pdf')).toBe(true);
      expect(matchRoute('/api/*', '/dashboard')).toBe(false);
    });

    it('matches with constraints', () => {
      expect(matchRoute('/users/:id(\\d+)', '/users/123')).toBe(true);
      expect(matchRoute('/users/:id(\\d+)', '/users/abc')).toBe(false);
    });
  });

  describe('generateRouteId', () => {
    it('generates consistent IDs for routes', () => {
      const id1 = generateRouteId('/dashboard/chatbots');
      const id2 = generateRouteId('/dashboard/chatbots');

      expect(id1).toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });

    it('generates different IDs for different routes', () => {
      const id1 = generateRouteId('/dashboard/chatbots');
      const id2 = generateRouteId('/dashboard/analytics');

      expect(id1).not.toBe(id2);
    });

    it('includes parameters in ID generation', () => {
      const id1 = generateRouteId('/users/123');
      const id2 = generateRouteId('/users/456');

      expect(id1).not.toBe(id2);
    });

    it('handles query parameters optionally', () => {
      const id1 = generateRouteId('/search?q=test');
      const id2 = generateRouteId('/search?q=different');
      const id3 = generateRouteId('/search', { includeQuery: false });

      expect(id1).not.toBe(id2);
      expect(generateRouteId('/search')).toBe(id3);
    });
  });

  describe('getRouteHierarchy', () => {
    it('builds route hierarchy', () => {
      const hierarchy = getRouteHierarchy('/dashboard/chatbots/123/edit');

      expect(hierarchy).toEqual([
        { path: '/', depth: 0 },
        { path: '/dashboard', depth: 1 },
        { path: '/dashboard/chatbots', depth: 2 },
        { path: '/dashboard/chatbots/123', depth: 3 },
        { path: '/dashboard/chatbots/123/edit', depth: 4 },
      ]);
    });

    it('includes route metadata', () => {
      const hierarchy = getRouteHierarchy('/dashboard/chatbots', {
        includeMetadata: true,
        routes: {
          '/dashboard': { title: 'Dashboard', icon: 'dashboard' },
          '/dashboard/chatbots': { title: 'Chatbots', icon: 'bot' },
        }
      });

      expect(hierarchy[1]).toEqual({
        path: '/dashboard',
        depth: 1,
        title: 'Dashboard',
        icon: 'dashboard',
      });
    });

    it('handles root route', () => {
      const hierarchy = getRouteHierarchy('/');

      expect(hierarchy).toEqual([
        { path: '/', depth: 0 },
      ]);
    });

    it('filters hierarchy by permissions', () => {
      const hierarchy = getRouteHierarchy('/admin/users/123', {
        filterByPermissions: true,
        userPermissions: ['user:read'],
        routes: {
          '/admin': { permissions: ['admin:access'] },
          '/admin/users': { permissions: ['user:read'] },
        }
      });

      expect(hierarchy).toHaveLength(2); // Should exclude /admin due to permissions
    });
  });

  describe('normalizeRoute', () => {
    it('normalizes basic routes', () => {
      expect(normalizeRoute('dashboard')).toBe('/dashboard');
      expect(normalizeRoute('/dashboard')).toBe('/dashboard');
      expect(normalizeRoute('/dashboard/')).toBe('/dashboard');
    });

    it('handles query parameters', () => {
      expect(normalizeRoute('/search?q=test'))
        .toBe('/search?q=test');
    });

    it('removes duplicate slashes', () => {
      expect(normalizeRoute('//dashboard//chatbots//'))
        .toBe('/dashboard/chatbots');
    });

    it('handles relative paths', () => {
      expect(normalizeRoute('./relative/path', '/current'))
        .toBe('/current/relative/path');

      expect(normalizeRoute('../parent/path', '/current/sub'))
        .toBe('/current/parent/path');
    });

    it('preserves hash fragments', () => {
      expect(normalizeRoute('/docs#section'))
        .toBe('/docs#section');
    });

    it('handles encoded characters', () => {
      expect(normalizeRoute('/search/hello%20world'))
        .toBe('/search/hello%20world');
    });
  });

  describe('getRoutePermissions', () => {
    it('extracts permissions for route', () => {
      const permissions = getRoutePermissions('/dashboard/users', {
        '/dashboard': ['dashboard:read'],
        '/dashboard/users': ['user:read', 'user:write'],
      });

      expect(permissions).toEqual(['user:read', 'user:write']);
    });

    it('inherits parent permissions', () => {
      const permissions = getRoutePermissions('/dashboard/users/123', {
        '/dashboard': ['dashboard:read'],
        '/dashboard/users': ['user:read'],
      }, { inheritParent: true });

      expect(permissions).toEqual(['dashboard:read', 'user:read']);
    });

    it('handles wildcard permissions', () => {
      const permissions = getRoutePermissions('/api/v1/users', {
        '/api/*': ['api:access'],
        '/api/v1/*': ['api:v1:access'],
      });

      expect(permissions).toContain('api:access');
      expect(permissions).toContain('api:v1:access');
    });

    it('returns empty array for unknown routes', () => {
      const permissions = getRoutePermissions('/unknown', {});

      expect(permissions).toEqual([]);
    });
  });

  describe('isRouteAccessible', () => {
    it('checks route accessibility with permissions', () => {
      expect(isRouteAccessible('/dashboard/users', mockUser, {
        '/dashboard/users': ['read', 'write'],
      })).toBe(true);

      expect(isRouteAccessible('/admin/system', mockUser, {
        '/admin/system': ['admin', 'super_admin'],
      })).toBe(false);
    });

    it('checks role-based access', () => {
      expect(isRouteAccessible('/admin/dashboard', mockUser, {
        '/admin/dashboard': { roles: ['admin', 'super_admin'] },
      })).toBe(true);

      expect(isRouteAccessible('/super-admin/settings', mockUser, {
        '/super-admin/settings': { roles: ['super_admin'] },
      })).toBe(false);
    });

    it('handles public routes', () => {
      expect(isRouteAccessible('/public/about', mockUser, {
        '/public/about': { public: true },
      })).toBe(true);

      expect(isRouteAccessible('/public/about', null, {
        '/public/about': { public: true },
      })).toBe(true);
    });

    it('handles authentication requirements', () => {
      expect(isRouteAccessible('/dashboard', mockUser, {
        '/dashboard': { requiresAuth: true },
      })).toBe(true);

      expect(isRouteAccessible('/dashboard', null, {
        '/dashboard': { requiresAuth: true },
      })).toBe(false);
    });

    it('handles organization-based access', () => {
      expect(isRouteAccessible('/org/settings', mockUser, {
        '/org/settings': { organizations: ['org-456'] },
      })).toBe(true);

      expect(isRouteAccessible('/org/settings', mockUser, {
        '/org/settings': { organizations: ['org-789'] },
      })).toBe(false);
    });
  });

  describe('getRouteMetadata', () => {
    it('extracts basic route metadata', () => {
      const metadata = getRouteMetadata('/dashboard/chatbots/123/edit');

      expect(metadata).toMatchObject({
        pathname: '/dashboard/chatbots/123/edit',
        depth: 4,
        segments: ['dashboard', 'chatbots', '123', 'edit'],
        hasParameters: true,
        isNested: true,
        isPublic: false,
      });
    });

    it('identifies route types', () => {
      expect(getRouteMetadata('/api/v1/users').isApiRoute).toBe(true);
      expect(getRouteMetadata('/admin/settings').isAdminRoute).toBe(true);
      expect(getRouteMetadata('/public/about').isPublic).toBe(true);
      expect(getRouteMetadata('/auth/login').isAuthRoute).toBe(true);
    });

    it('extracts route configuration', () => {
      const metadata = getRouteMetadata('/dashboard', {
        '/dashboard': {
          title: 'Dashboard',
          description: 'Main dashboard',
          layout: 'default',
          permissions: ['dashboard:read'],
        }
      });

      expect(metadata.title).toBe('Dashboard');
      expect(metadata.description).toBe('Main dashboard');
      expect(metadata.layout).toBe('default');
      expect(metadata.permissions).toEqual(['dashboard:read']);
    });

    it('calculates route complexity', () => {
      expect(getRouteMetadata('/simple').complexity).toBe('low');
      expect(getRouteMetadata('/dashboard/settings').complexity).toBe('medium');
      expect(getRouteMetadata('/admin/users/123/permissions/edit').complexity).toBe('high');
    });

    it('identifies parent and child routes', () => {
      const metadata = getRouteMetadata('/dashboard/chatbots/123');

      expect(metadata.parentRoute).toBe('/dashboard/chatbots');
      expect(metadata.possibleChildRoutes).toContain('/dashboard/chatbots/123/edit');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles malformed URLs gracefully', () => {
      expect(() => parseRoute('not://a/valid/url')).not.toThrow();
      expect(() => validateRoute('')).not.toThrow();
      expect(() => buildUrl(null as any)).not.toThrow();
    });

    it('handles very long URLs', () => {
      const longPath = '/' + Array(1000).fill('segment').join('/');

      expect(validateRoute(longPath, { maxLength: 5000 })).toBe(true);
      expect(validateRoute(longPath, { maxLength: 100 })).toBe(false);
    });

    it('handles special characters in routes', () => {
      const specialRoute = '/files/文档/测试 file.pdf';

      expect(validateRoute(specialRoute)).toBe(true);
      expect(parseRoute(specialRoute).segments).toContain('文档');
    });

    it('handles circular route references', () => {
      const circularRoutes: any = {};
      circularRoutes['/a'] = { parent: '/b' };
      circularRoutes['/b'] = { parent: '/a' };

      expect(() => getRouteHierarchy('/a', { routes: circularRoutes })).not.toThrow();
    });

    it('handles memory-intensive operations efficiently', () => {
      const complexRoute = '/dashboard/' + Array(100).fill('level').join('/');
      const start = performance.now();

      parseRoute(complexRoute);

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // Should complete within 50ms
    });
  });
});