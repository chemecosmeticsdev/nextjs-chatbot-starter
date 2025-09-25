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
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"

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

  // Create navigation data structure similar to shadcn sidebar-03
  const navMain = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: Home,
    },
    {
      title: "Chat",
      url: "/chat",
      icon: MessageSquare,
    },
    {
      title: "Documents",
      url: "#",
      icon: FileText,
      items: user.role === 'admin' || user.role === 'super_admin' ? [
        {
          title: "All Documents",
          url: "/dashboard/documents",
          isActive: pathname === "/dashboard/documents",
        },
        {
          title: "Upload Document",
          url: "/dashboard/documents/upload",
          isActive: pathname === "/dashboard/documents/upload",
        },
      ] : undefined,
    },
    {
      title: "Analytics",
      url: "/dashboard/analytics",
      icon: BarChart3,
      isVisible: user.role === 'admin' || user.role === 'super_admin',
    },
    {
      title: "Chatbots",
      url: "#",
      icon: Bot,
      items: user.role === 'super_admin' ? [
        {
          title: "All Chatbots",
          url: "/dashboard/chatbots",
          isActive: pathname === "/dashboard/chatbots",
        },
        {
          title: "Create Chatbot",
          url: "/dashboard/chatbots/create",
          isActive: pathname === "/dashboard/chatbots/create",
        },
      ] : undefined,
    },
    {
      title: "User Management",
      url: "/dashboard/users",
      icon: Users,
      isVisible: user.role === 'super_admin',
    },
    {
      title: "System",
      url: "#",
      icon: Database,
      items: user.role === 'super_admin' ? [
        {
          title: "Settings",
          url: "/dashboard/settings",
          isActive: pathname === "/dashboard/settings",
        },
        {
          title: "Activity Logs",
          url: "/dashboard/logs",
          isActive: pathname === "/dashboard/logs",
        },
      ] : undefined,
    },
  ]

  const handleNavigation = (url: string) => {
    router.push(url)
  }

  return (
    <Sidebar variant="sidebar" collapsible="icon">
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
        <SidebarGroup>
          <SidebarMenu>
            {navMain.map((item) => {
              // Skip items that shouldn't be visible for current user role
              if (item.isVisible === false || (item.items === undefined && item.url === "#")) {
                return null
              }

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a
                      href={item.url === "#" ? undefined : item.url}
                      className="font-medium cursor-pointer"
                      onClick={item.url !== "#" ? () => handleNavigation(item.url) : undefined}
                    >
                      <item.icon />
                      {item.title}
                    </a>
                  </SidebarMenuButton>
                  {item.items?.length ? (
                    <SidebarMenuSub>
                      {item.items.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={subItem.isActive}
                          >
                            <a
                              href={subItem.url}
                              onClick={() => handleNavigation(subItem.url)}
                            >
                              {subItem.title}
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
        </SidebarGroup>
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