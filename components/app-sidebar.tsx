"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  MessageSquare,
  Database,
  Users,
  BarChart3,
  FileText,
  Bot,
  Home,
  Search,
  Activity,
  Settings,
  FileUp,
  Workflow,
  Plus,
  Monitor,
  ScrollText,
  Shield,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useNavigationAnalytics } from "@/lib/utils/navigation-analytics"

interface User {
  id: string
  email: string
  full_name: string
  role: string
}

interface AppSidebarProps {
  user: User
}

export function AppSidebar({ user }: AppSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { state } = useSidebar()
  const { trackSidebarClick, trackKeyboardShortcut } = useNavigationAnalytics()

  // Helper function to check if a route is active
  const isRouteActive = (url: string) => {
    if (url === "/dashboard") {
      return pathname === "/dashboard"
    }
    return pathname.startsWith(url)
  }

  // Organize navigation into logical groups
  const navGroups = [
    {
      label: "Main",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: Home,
          isActive: isRouteActive("/dashboard") && pathname === "/dashboard",
        },
        {
          title: "Chat",
          url: "/chat",
          icon: MessageSquare,
          isActive: isRouteActive("/chat"),
        },
      ]
    },
    {
      label: "Content Management",
      items: [
        {
          title: "Documents",
          url: "#",
          icon: FileText,
          isActive: isRouteActive("/dashboard/documents"),
          items: user.role === 'admin' || user.role === 'super_admin' ? [
            {
              title: "All Documents",
              url: "/dashboard/documents",
              icon: FileText,
              isActive: pathname === "/dashboard/documents",
            },
            {
              title: "Upload Document",
              url: "/dashboard/documents/upload",
              icon: FileUp,
              isActive: pathname === "/dashboard/documents/upload",
            },
            {
              title: "Step Functions",
              url: "/dashboard/documents/step-functions",
              icon: Workflow,
              isActive: pathname === "/dashboard/documents/step-functions",
            },
          ] : undefined,
          isVisible: user.role === 'admin' || user.role === 'super_admin',
        },
        {
          title: "Knowledge Base",
          url: "/dashboard/knowledge-base",
          icon: Search,
          isActive: isRouteActive("/dashboard/knowledge-base"),
          isVisible: user.role === 'admin' || user.role === 'super_admin',
        },
      ].filter(item => item.isVisible !== false),
    },
    {
      label: "Bot Management",
      items: [
        {
          title: "Chatbots",
          url: "#",
          icon: Bot,
          isActive: isRouteActive("/dashboard/chatbots"),
          items: user.role === 'super_admin' ? [
            {
              title: "All Chatbots",
              url: "/dashboard/chatbots",
              icon: Bot,
              isActive: pathname === "/dashboard/chatbots",
            },
            {
              title: "Create Chatbot",
              url: "/dashboard/chatbots/create",
              icon: Plus,
              isActive: pathname === "/dashboard/chatbots/create",
            },
          ] : undefined,
          isVisible: user.role === 'super_admin',
        },
      ].filter(item => item.isVisible !== false),
    },
    {
      label: "Analytics & Monitoring",
      items: [
        {
          title: "Analytics",
          url: "/dashboard/analytics",
          icon: BarChart3,
          isActive: isRouteActive("/dashboard/analytics"),
          isVisible: user.role === 'admin' || user.role === 'super_admin',
        },
        {
          title: "Live Monitoring",
          url: "/dashboard/monitoring",
          icon: Monitor,
          isActive: isRouteActive("/dashboard/monitoring"),
          isVisible: user.role === 'admin' || user.role === 'super_admin',
        },
      ].filter(item => item.isVisible !== false),
    },
    {
      label: "Administration",
      items: [
        {
          title: "User Management",
          url: "/dashboard/users",
          icon: Users,
          isActive: isRouteActive("/dashboard/users"),
          isVisible: user.role === 'super_admin',
        },
        {
          title: "System",
          url: "#",
          icon: Database,
          isActive: isRouteActive("/dashboard/settings") || isRouteActive("/dashboard/logs"),
          items: user.role === 'super_admin' ? [
            {
              title: "Settings",
              url: "/dashboard/settings",
              icon: Settings,
              isActive: pathname === "/dashboard/settings",
            },
            {
              title: "Activity Logs",
              url: "/dashboard/logs",
              icon: ScrollText,
              isActive: pathname === "/dashboard/logs",
            },
          ] : undefined,
          isVisible: user.role === 'super_admin',
        },
      ].filter(item => item.isVisible !== false),
    },
  ].filter(group => group.items.length > 0)

  const handleNavigation = (url: string, itemLabel?: string) => {
    if (itemLabel) {
      trackSidebarClick(url, itemLabel)
    } else {
      router.push(url)
    }
  }

  const handleKeyboardNavigation = React.useCallback((event: KeyboardEvent) => {
    // Navigation keyboard shortcuts
    if (event.altKey) {
      switch (event.key) {
        case '1':
          event.preventDefault()
          trackKeyboardShortcut('/dashboard', 'Alt+1')
          break
        case '2':
          event.preventDefault()
          trackKeyboardShortcut('/chat', 'Alt+2')
          break
        case '3':
          if (user.role === 'admin' || user.role === 'super_admin') {
            event.preventDefault()
            trackKeyboardShortcut('/dashboard/documents', 'Alt+3')
          }
          break
        case '4':
          if (user.role === 'admin' || user.role === 'super_admin') {
            event.preventDefault()
            trackKeyboardShortcut('/dashboard/analytics', 'Alt+4')
          }
          break
      }
    }
  }, [trackKeyboardShortcut, user.role])

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyboardNavigation)
    return () => {
      document.removeEventListener('keydown', handleKeyboardNavigation)
    }
  }, [handleKeyboardNavigation])

  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      className="border-r border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <MessageSquare className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-medium">Chatbot Dashboard</span>
                  <span className="">Management System</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={item.isActive}
                        className={cn(
                          "font-medium cursor-pointer",
                          item.isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                        )}
                      >
                        <a
                          href={item.url === "#" ? undefined : item.url}
                          onClick={item.url !== "#" ? () => handleNavigation(item.url, item.title) : undefined}
                        >
                          <item.icon />
                          <span>{item.title}</span>
                          {item.url !== "#" && item.items?.length && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              Alt+{group.label === "Main" ? (item.title === "Dashboard" ? "1" : "2") : ""}
                            </span>
                          )}
                        </a>
                      </SidebarMenuButton>
                      {item.items?.length ? (
                        <SidebarMenuSub>
                          {item.items.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={subItem.isActive}
                                className={cn(
                                  subItem.isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                                )}
                              >
                                <a
                                  href={subItem.url}
                                  onClick={() => handleNavigation(subItem.url, subItem.title)}
                                  className="flex items-center gap-2"
                                >
                                  {subItem.icon && <subItem.icon className="size-4" />}
                                  <span>{subItem.title}</span>
                                </a>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      ) : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 p-2">
              {state === "expanded" ? (
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.role === 'super_admin' ? 'Super Admin' : user.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                  <div className="text-xs text-muted-foreground mt-1 border-t pt-1">
                    Navigation: Alt + 1-4
                  </div>
                </div>
              ) : (
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-xs font-medium text-primary">
                    {user.email
                      .split('@')[0]
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}