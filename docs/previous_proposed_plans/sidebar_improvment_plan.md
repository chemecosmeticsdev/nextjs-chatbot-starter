I understand the issue! After analyzing both your provided shadcn sidebar-03 example and our
   current implementation, I can see the key differences that need to be addressed to match
  the official shadcn behavior.

  Analysis of the Problem

  Current Issues in Our Sidebar:
  1. Excessive highlighting: Our current implementation applies isActive highlighting to too
  many menu items
  2. Incorrect navigation structure: Using complex role-based grouping that differs from
  shadcn-03 pattern
  3. Over-engineered active state logic: Custom isActive function that highlights entire paths
   instead of specific items
  4. Missing proper collapsible behavior: Not following shadcn-03's clean collapsible pattern

  Shadcn sidebar-03 Key Characteristics:
  1. Minimal highlighting: Only the truly active sub-item gets highlighted (like "Data
  Fetching" in the example)
  2. Clean structure: Simple menu with collapsible sub-menus, no complex grouping
  3. Proper collapsible behavior: Uses shadcn's built-in collapsible components
  4. No header navigation highlights: Main menu items don't get active states, only sub-items
  do
                                                                                             
●User approved Claude's plan:
  ⎿ Remove Sidebar Menu Highlights to Match shadcn sidebar-03

    Problem Analysis

    Our current sidebar has excessive highlighting that doesn't match the official shadcn 
    sidebar-03 example. The official version only highlights specific active sub-menu items, 
    not entire navigation sections.

    Implementation Plan

    1. Restructure Sidebar Navigation Pattern

    - Remove complex role-based grouping (Admin/Super Admin sections)
    - Implement clean shadcn sidebar-03 structure with collapsible sub-menus
    - Follow the exact pattern from the provided official code

    2. Fix Active State Logic

    - Remove custom isActive highlighting from main navigation items
    - Only apply isActive to specific sub-menu items that match current page
    - Remove hover and active states from parent menu buttons

    3. Clean Up Navigation Structure

    - Consolidate navigation items into single menu structure
    - Use proper shadcn collapsible components
    - Remove unnecessary tooltips and custom click handlers
    - Implement role-based visibility through conditional rendering of sub-items

    4. Update Sidebar Components

    - Replace SidebarGroupContent and SidebarGroupLabel with simpler structure
    - Use SidebarRail component as in official example
    - Simplify header to match official pattern
    - Clean up footer implementation

    5. Navigation Behavior Changes

    - Remove onClick handlers from parent menu items
    - Let shadcn handle collapsible behavior naturally
    - Only sub-menu items should be clickable and highlighted
    - Parent items should only control expand/collapse

    Expected Outcome

    The sidebar will match the official shadcn sidebar-03 behavior:
    - Clean, minimal highlighting only on active sub-items
    - Proper collapsible menu behavior
    - Professional appearance matching shadcn standards
    - Simplified navigation structure without over-engineered active states