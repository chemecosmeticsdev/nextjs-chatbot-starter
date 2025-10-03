import {
  generateBreadcrumbs,
  formatBreadcrumbTitle,
  getBreadcrumbIcon,
  getBreadcrumbPath,
  createBreadcrumbFromRoute,
  validateBreadcrumbStructure,
  optimizeBreadcrumbLength,
  getBreadcrumbMetadata,
} from '@/utils/navigation/breadcrumb-utils';

// Mock Next.js router
const mockRouter = {
  pathname: '/dashboard/chatbots/create',
  query: { id: '123', category: 'ai' },
  asPath: '/dashboard/chatbots/create?id=123&category=ai',
};

jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

describe('Breadcrumb Utils', () => {
  describe('generateBreadcrumbs', () => {
    it('generates basic breadcrumbs from pathname', () => {
      const breadcrumbs = generateBreadcrumbs('/dashboard/chatbots/create');

      expect(breadcrumbs).toEqual([
        {
          label: 'Dashboard',
          href: '/dashboard',
          icon: 'dashboard',
          isActive: false,
        },
        {
          label: 'Chatbots',
          href: '/dashboard/chatbots',
          icon: 'bot',
          isActive: false,
        },
        {
          label: 'Create',
          href: '/dashboard/chatbots/create',
          icon: 'plus',
          isActive: true,
        },
      ]);
    });

    it('handles root path', () => {
      const breadcrumbs = generateBreadcrumbs('/');

      expect(breadcrumbs).toEqual([
        {
          label: 'Home',
          href: '/',
          icon: 'home',
          isActive: true,
        },
      ]);
    });

    it('handles nested paths with parameters', () => {
      const breadcrumbs = generateBreadcrumbs('/dashboard/chatbots/edit/123');

      expect(breadcrumbs).toEqual([
        {
          label: 'Dashboard',
          href: '/dashboard',
          icon: 'dashboard',
          isActive: false,
        },
        {
          label: 'Chatbots',
          href: '/dashboard/chatbots',
          icon: 'bot',
          isActive: false,
        },
        {
          label: 'Edit',
          href: '/dashboard/chatbots/edit',
          icon: 'edit',
          isActive: false,
        },
        {
          label: 'Chatbot 123',
          href: '/dashboard/chatbots/edit/123',
          icon: 'file',
          isActive: true,
        },
      ]);
    });

    it('applies custom breadcrumb configuration', () => {
      const customConfig = {
        '/dashboard/analytics': {
          label: 'Analytics Dashboard',
          icon: 'chart',
          description: 'View analytics and metrics',
        },
      };

      const breadcrumbs = generateBreadcrumbs('/dashboard/analytics', customConfig);

      expect(breadcrumbs[1]).toEqual({
        label: 'Analytics Dashboard',
        href: '/dashboard/analytics',
        icon: 'chart',
        description: 'View analytics and metrics',
        isActive: true,
      });
    });

    it('handles special characters in path', () => {
      const breadcrumbs = generateBreadcrumbs('/dashboard/files/my%20file');

      expect(breadcrumbs[2]).toEqual({
        label: 'My File',
        href: '/dashboard/files/my%20file',
        icon: 'file',
        isActive: true,
      });
    });

    it('limits breadcrumb depth', () => {
      const deepPath = '/dashboard/level1/level2/level3/level4/level5';
      const breadcrumbs = generateBreadcrumbs(deepPath, {}, { maxDepth: 3 });

      expect(breadcrumbs).toHaveLength(4); // Home + 3 levels
      expect(breadcrumbs[1].label).toBe('...');
      expect(breadcrumbs[1].isEllipsis).toBe(true);
    });
  });

  describe('formatBreadcrumbTitle', () => {
    it('formats simple titles', () => {
      expect(formatBreadcrumbTitle('dashboard')).toBe('Dashboard');
      expect(formatBreadcrumbTitle('chatbots')).toBe('Chatbots');
      expect(formatBreadcrumbTitle('create')).toBe('Create');
    });

    it('handles camelCase and PascalCase', () => {
      expect(formatBreadcrumbTitle('userProfile')).toBe('User Profile');
      expect(formatBreadcrumbTitle('AdminSettings')).toBe('Admin Settings');
    });

    it('handles kebab-case and snake_case', () => {
      expect(formatBreadcrumbTitle('user-profile')).toBe('User Profile');
      expect(formatBreadcrumbTitle('admin_settings')).toBe('Admin Settings');
    });

    it('handles special cases', () => {
      expect(formatBreadcrumbTitle('api')).toBe('API');
      expect(formatBreadcrumbTitle('ui')).toBe('UI');
      expect(formatBreadcrumbTitle('id')).toBe('ID');
      expect(formatBreadcrumbTitle('url')).toBe('URL');
    });

    it('handles numbers and UUIDs', () => {
      expect(formatBreadcrumbTitle('123')).toBe('Item 123');
      expect(formatBreadcrumbTitle('user-123')).toBe('User 123');
      expect(formatBreadcrumbTitle('550e8400-e29b-41d4-a716-446655440000'))
        .toBe('Item 550e8400');
    });

    it('applies custom formatting rules', () => {
      const customRules = {
        'chatbot': 'AI Chatbot',
        'docs': 'Documentation',
      };

      expect(formatBreadcrumbTitle('chatbot', customRules)).toBe('AI Chatbot');
      expect(formatBreadcrumbTitle('docs', customRules)).toBe('Documentation');
    });

    it('handles empty and invalid inputs', () => {
      expect(formatBreadcrumbTitle('')).toBe('');
      expect(formatBreadcrumbTitle(null as any)).toBe('');
      expect(formatBreadcrumbTitle(undefined as any)).toBe('');
    });
  });

  describe('getBreadcrumbIcon', () => {
    it('returns icons for common paths', () => {
      expect(getBreadcrumbIcon('dashboard')).toBe('dashboard');
      expect(getBreadcrumbIcon('chatbots')).toBe('bot');
      expect(getBreadcrumbIcon('analytics')).toBe('chart');
      expect(getBreadcrumbIcon('settings')).toBe('settings');
      expect(getBreadcrumbIcon('users')).toBe('users');
    });

    it('returns action icons', () => {
      expect(getBreadcrumbIcon('create')).toBe('plus');
      expect(getBreadcrumbIcon('edit')).toBe('edit');
      expect(getBreadcrumbIcon('delete')).toBe('trash');
      expect(getBreadcrumbIcon('view')).toBe('eye');
    });

    it('returns default icon for unknown paths', () => {
      expect(getBreadcrumbIcon('unknown-path')).toBe('folder');
      expect(getBreadcrumbIcon('random')).toBe('folder');
    });

    it('handles file extensions', () => {
      expect(getBreadcrumbIcon('document.pdf')).toBe('file-pdf');
      expect(getBreadcrumbIcon('image.jpg')).toBe('file-image');
      expect(getBreadcrumbIcon('data.csv')).toBe('file-spreadsheet');
    });

    it('applies custom icon mapping', () => {
      const customIcons = {
        'custom-page': 'star',
        'special-section': 'diamond',
      };

      expect(getBreadcrumbIcon('custom-page', customIcons)).toBe('star');
      expect(getBreadcrumbIcon('special-section', customIcons)).toBe('diamond');
    });
  });

  describe('getBreadcrumbPath', () => {
    it('constructs paths correctly', () => {
      expect(getBreadcrumbPath(['dashboard'])).toBe('/dashboard');
      expect(getBreadcrumbPath(['dashboard', 'chatbots'])).toBe('/dashboard/chatbots');
      expect(getBreadcrumbPath(['dashboard', 'chatbots', 'create']))
        .toBe('/dashboard/chatbots/create');
    });

    it('handles empty segments', () => {
      expect(getBreadcrumbPath([])).toBe('/');
      expect(getBreadcrumbPath(['', 'dashboard'])).toBe('/dashboard');
    });

    it('preserves query parameters', () => {
      expect(getBreadcrumbPath(['dashboard', 'chatbots'], { id: '123', sort: 'name' }))
        .toBe('/dashboard/chatbots?id=123&sort=name');
    });

    it('handles special characters', () => {
      expect(getBreadcrumbPath(['files', 'my file.txt']))
        .toBe('/files/my%20file.txt');
    });

    it('applies base path', () => {
      expect(getBreadcrumbPath(['api', 'v1'], {}, '/app'))
        .toBe('/app/api/v1');
    });
  });

  describe('createBreadcrumbFromRoute', () => {
    it('creates breadcrumb from route object', () => {
      const route = {
        path: '/dashboard/chatbots',
        title: 'AI Chatbots',
        icon: 'bot',
        metadata: { count: 5 },
      };

      const breadcrumb = createBreadcrumbFromRoute(route, false);

      expect(breadcrumb).toEqual({
        label: 'AI Chatbots',
        href: '/dashboard/chatbots',
        icon: 'bot',
        metadata: { count: 5 },
        isActive: false,
      });
    });

    it('marks breadcrumb as active', () => {
      const route = { path: '/current', title: 'Current Page' };
      const breadcrumb = createBreadcrumbFromRoute(route, true);

      expect(breadcrumb.isActive).toBe(true);
    });

    it('handles missing properties gracefully', () => {
      const route = { path: '/minimal' };
      const breadcrumb = createBreadcrumbFromRoute(route, false);

      expect(breadcrumb).toEqual({
        label: 'Minimal',
        href: '/minimal',
        icon: 'folder',
        isActive: false,
      });
    });

    it('includes description and accessibility info', () => {
      const route = {
        path: '/dashboard',
        title: 'Dashboard',
        description: 'Main dashboard view',
        ariaLabel: 'Navigate to dashboard',
      };

      const breadcrumb = createBreadcrumbFromRoute(route, false);

      expect(breadcrumb.description).toBe('Main dashboard view');
      expect(breadcrumb.ariaLabel).toBe('Navigate to dashboard');
    });
  });

  describe('validateBreadcrumbStructure', () => {
    it('validates correct breadcrumb structure', () => {
      const validBreadcrumbs = [
        { label: 'Home', href: '/', isActive: false },
        { label: 'Dashboard', href: '/dashboard', isActive: true },
      ];

      expect(validateBreadcrumbStructure(validBreadcrumbs)).toBe(true);
    });

    it('rejects invalid breadcrumb structure', () => {
      const invalidBreadcrumbs = [
        { label: 'Home' }, // Missing href
        { href: '/dashboard', isActive: true }, // Missing label
      ];

      expect(validateBreadcrumbStructure(invalidBreadcrumbs as any)).toBe(false);
    });

    it('validates breadcrumb properties', () => {
      const breadcrumbsWithInvalidTypes = [
        { label: 123, href: '/', isActive: false }, // Invalid label type
        { label: 'Home', href: null, isActive: true }, // Invalid href type
      ];

      expect(validateBreadcrumbStructure(breadcrumbsWithInvalidTypes as any)).toBe(false);
    });

    it('handles empty breadcrumbs array', () => {
      expect(validateBreadcrumbStructure([])).toBe(true);
    });

    it('validates optional properties', () => {
      const breadcrumbsWithOptional = [
        {
          label: 'Home',
          href: '/',
          isActive: false,
          icon: 'home',
          description: 'Home page',
          metadata: { type: 'page' },
        },
      ];

      expect(validateBreadcrumbStructure(breadcrumbsWithOptional)).toBe(true);
    });
  });

  describe('optimizeBreadcrumbLength', () => {
    it('truncates long breadcrumb trails', () => {
      const longBreadcrumbs = [
        { label: 'Home', href: '/', isActive: false },
        { label: 'Level1', href: '/level1', isActive: false },
        { label: 'Level2', href: '/level1/level2', isActive: false },
        { label: 'Level3', href: '/level1/level2/level3', isActive: false },
        { label: 'Level4', href: '/level1/level2/level3/level4', isActive: false },
        { label: 'Current', href: '/level1/level2/level3/level4/current', isActive: true },
      ];

      const optimized = optimizeBreadcrumbLength(longBreadcrumbs, 4);

      expect(optimized).toHaveLength(4);
      expect(optimized[0].label).toBe('Home');
      expect(optimized[1].label).toBe('...');
      expect(optimized[1].isEllipsis).toBe(true);
      expect(optimized[2].label).toBe('Level4');
      expect(optimized[3].label).toBe('Current');
    });

    it('preserves important breadcrumbs', () => {
      const breadcrumbs = [
        { label: 'Home', href: '/', isActive: false, important: true },
        { label: 'Level1', href: '/level1', isActive: false },
        { label: 'Level2', href: '/level1/level2', isActive: false },
        { label: 'Important', href: '/level1/level2/important', isActive: false, important: true },
        { label: 'Current', href: '/level1/level2/important/current', isActive: true },
      ];

      const optimized = optimizeBreadcrumbLength(breadcrumbs, 4);

      expect(optimized.map(b => b.label)).toEqual(['Home', '...', 'Important', 'Current']);
    });

    it('handles breadcrumbs shorter than max length', () => {
      const shortBreadcrumbs = [
        { label: 'Home', href: '/', isActive: false },
        { label: 'Dashboard', href: '/dashboard', isActive: true },
      ];

      const optimized = optimizeBreadcrumbLength(shortBreadcrumbs, 5);

      expect(optimized).toEqual(shortBreadcrumbs);
    });

    it('maintains active breadcrumb', () => {
      const breadcrumbs = [
        { label: 'A', href: '/a', isActive: false },
        { label: 'B', href: '/a/b', isActive: false },
        { label: 'C', href: '/a/b/c', isActive: false },
        { label: 'D', href: '/a/b/c/d', isActive: true },
      ];

      const optimized = optimizeBreadcrumbLength(breadcrumbs, 2);

      expect(optimized[optimized.length - 1].isActive).toBe(true);
      expect(optimized[optimized.length - 1].label).toBe('D');
    });
  });

  describe('getBreadcrumbMetadata', () => {
    it('extracts metadata from pathname', () => {
      const metadata = getBreadcrumbMetadata('/dashboard/chatbots/123/edit');

      expect(metadata).toEqual({
        depth: 4,
        sections: ['dashboard', 'chatbots', '123', 'edit'],
        hasParameters: true,
        parameterValues: ['123'],
        rootSection: 'dashboard',
        currentSection: 'edit',
        breadcrumbType: 'nested',
      });
    });

    it('identifies different breadcrumb types', () => {
      expect(getBreadcrumbMetadata('/').breadcrumbType).toBe('root');
      expect(getBreadcrumbMetadata('/dashboard').breadcrumbType).toBe('single');
      expect(getBreadcrumbMetadata('/dashboard/settings').breadcrumbType).toBe('simple');
      expect(getBreadcrumbMetadata('/dashboard/users/123/edit').breadcrumbType).toBe('nested');
    });

    it('detects query parameters', () => {
      const metadata = getBreadcrumbMetadata('/search?q=test&filter=recent');

      expect(metadata.hasQueryParameters).toBe(true);
      expect(metadata.queryParameters).toEqual({ q: 'test', filter: 'recent' });
    });

    it('analyzes path complexity', () => {
      const complexPath = '/dashboard/analytics/reports/monthly/2024/january';
      const metadata = getBreadcrumbMetadata(complexPath);

      expect(metadata.complexity).toBe('high');
      expect(metadata.depth).toBe(6);
    });

    it('identifies special routes', () => {
      expect(getBreadcrumbMetadata('/api/v1/users').isApiRoute).toBe(true);
      expect(getBreadcrumbMetadata('/dashboard').isApiRoute).toBe(false);

      expect(getBreadcrumbMetadata('/admin/system').isAdminRoute).toBe(true);
      expect(getBreadcrumbMetadata('/dashboard').isAdminRoute).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles malformed URLs', () => {
      expect(() => generateBreadcrumbs('not-a-valid-url')).not.toThrow();
      expect(() => generateBreadcrumbs('')).not.toThrow();
      expect(() => generateBreadcrumbs('//')).not.toThrow();
    });

    it('handles null and undefined inputs', () => {
      expect(generateBreadcrumbs(null as any)).toEqual([]);
      expect(generateBreadcrumbs(undefined as any)).toEqual([]);
      expect(formatBreadcrumbTitle(null as any)).toBe('');
    });

    it('handles very long path segments', () => {
      const longSegment = 'a'.repeat(1000);
      const breadcrumbs = generateBreadcrumbs(`/dashboard/${longSegment}`);

      expect(breadcrumbs[1].label.length).toBeLessThanOrEqual(50); // Should be truncated
    });

    it('handles special characters and encoding', () => {
      const specialPath = '/files/文档/测试%20file.txt';
      const breadcrumbs = generateBreadcrumbs(specialPath);

      expect(breadcrumbs).toHaveLength(4);
      expect(breadcrumbs[2].label).toBe('测试 File');
    });

    it('handles circular references in configuration', () => {
      const circularConfig: any = {};
      circularConfig['/test'] = { label: 'Test', parent: circularConfig };

      expect(() => generateBreadcrumbs('/test', circularConfig)).not.toThrow();
    });

    it('handles memory-intensive operations efficiently', () => {
      const deepPath = '/' + Array(100).fill('level').join('/');
      const start = performance.now();

      generateBreadcrumbs(deepPath);

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });
  });

  describe('Internationalization Support', () => {
    it('supports localized breadcrumb labels', () => {
      const i18nConfig = {
        '/dashboard': {
          label: { en: 'Dashboard', es: 'Panel', fr: 'Tableau' }
        },
      };

      const breadcrumbs = generateBreadcrumbs('/dashboard', i18nConfig, { locale: 'es' });

      expect(breadcrumbs[0].label).toBe('Panel');
    });

    it('falls back to default language', () => {
      const i18nConfig = {
        '/dashboard': {
          label: { en: 'Dashboard', fr: 'Tableau' }
        },
      };

      const breadcrumbs = generateBreadcrumbs('/dashboard', i18nConfig, { locale: 'es' });

      expect(breadcrumbs[0].label).toBe('Dashboard'); // Falls back to English
    });

    it('handles RTL languages', () => {
      const breadcrumbs = generateBreadcrumbs('/dashboard/settings', {}, {
        locale: 'ar',
        direction: 'rtl'
      });

      expect(breadcrumbs[0].direction).toBe('rtl');
    });
  });
});