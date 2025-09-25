Perfect! I've successfully refactored the sidebar to match the official shadcn sidebar-03
  pattern. Here's what was accomplished:

  ✅ Complete Sidebar Transformation

  🎯 Key Changes Made:

  1. Removed Excessive Highlighting - Main navigation items no longer have active states
  2. Clean Structure - Eliminated complex role-based grouping (Admin/Super Admin sections)
  3. Official shadcn Pattern - Now follows the exact structure from sidebar-03 example
  4. Proper Collapsible Behavior - Uses shadcn's built-in collapsible components
  5. Minimal Highlighting - Only sub-menu items get active states when they match current page

  🛠️ Technical Improvements:

  - Header: Now uses proper SidebarMenu structure like official example
  - Navigation: Single clean SidebarGroup without complex nesting
  - Role-based Visibility: Handled through conditional rendering, not separate sections
  - Active States: Only applied to specific sub-menu items that match current pathname
  - SidebarRail: Added proper rail component as in official example

  🎨 Visual Result:
  - Clean, minimal interface matching shadcn sidebar-03 standards
  - No excessive blue highlighting on main navigation items
  - Only truly active sub-menu items are highlighted
  - Professional appearance with proper collapsible behavior
  - Role-based features seamlessly integrated without visual clutter

  The sidebar now behaves exactly like the official shadcn sidebar-03 example you provided -
  clean, minimal highlighting with proper collapsible sub-menus. The development server is
  running on http://localhost:3001 for immediate testing! 🚀