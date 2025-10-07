"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Shield,
  User,
  Crown,
  Eye,
  Edit,
  Trash2,
  Ban,
  CheckCircle
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface User {
  id: string
  email: string
  full_name: string
  role: string
}

interface UserData {
  id: string
  email: string
  full_name: string
  role: 'user' | 'admin' | 'super_admin'
  status: 'active' | 'inactive' | 'suspended'
  created_at: string
  last_login: string
  avatar_url?: string
  phone?: string
  department?: string
}

export default function UsersPage() {
  // Set up breadcrumbs for User Management page
  useBreadcrumbs({
    autoGenerate: true,
    trackAnalytics: false,
    customTitles: {
      'users': 'User Management'
    }
  });

  const router = useRouter()
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [users, setUsers] = React.useState<UserData[]>([])
  const [usersLoading, setUsersLoading] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    checkAuth()
  }, [])

  React.useEffect(() => {
    if (user) {
      fetchUsers()
    }
  }, [user])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/v1/auth/me')
      const data = await response.json()

      if (response.ok && data.success && data.user.role === 'super_admin') {
        setUser(data.user)
      } else {
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('Error checking auth:', error)
      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    setUsersLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: '0',
        includeInactive: 'true'
      })

      if (searchTerm) params.append('search', searchTerm)
      if (roleFilter) params.append('role', roleFilter)

      const response = await fetch(`/api/v1/admin/users?${params}`)
      const data = await response.json()

      if (response.ok && data.success) {
        setUsers(data.data.users)
      } else {
        setError(data.error || 'Failed to fetch users')
        console.error('Failed to fetch users:', data.error)
      }
    } catch (error) {
      setError('Failed to fetch users')
      console.error('Error fetching users:', error)
    } finally {
      setUsersLoading(false)
    }
  }

  const handleSearch = () => {
    fetchUsers()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Filter users client-side based on status filter
  const filteredUsers = users.filter(userData => {
    if (statusFilter && userData.status !== statusFilter) {
      return false
    }
    return true
  })

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin': 
        return (
          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100/80">
            <Crown className="mr-1 h-3 w-3" />
            Super Admin
          </Badge>
        )
      case 'admin': 
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100/80">
            <Shield className="mr-1 h-3 w-3" />
            Admin
          </Badge>
        )
      case 'user': 
        return (
          <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100/80">
            <User className="mr-1 h-3 w-3" />
            User
          </Badge>
        )
      default: return <Badge variant="secondary">{role}</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100/80">Active</Badge>
      case 'inactive': return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100/80">Inactive</Badge>
      case 'suspended': return <Badge className="bg-red-100 text-red-700 hover:bg-red-100/80">Suspended</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase()
  }

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'active').length,
    adminUsers: users.filter(u => u.role === 'admin' || u.role === 'super_admin').length,
    suspendedUsers: users.filter(u => u.status === 'suspended').length
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Manage user accounts, roles, and permissions across your organization
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Invite User
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              All registered users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              Currently active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Administrators</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.adminUsers}</div>
            <p className="text-xs text-muted-foreground">
              Admin & Super Admin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <Ban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.suspendedUsers}</div>
            <p className="text-xs text-muted-foreground">
              Require attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name, email, or department..."
                className="w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
            <Button onClick={handleSearch} disabled={usersLoading}>
              <Search className="mr-2 h-4 w-4" />
              {usersLoading ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Manage user accounts, roles, and access permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={fetchUsers}
                disabled={usersLoading}
              >
                Try Again
              </Button>
            </div>
          )}

          {usersLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2 text-muted-foreground">Loading users...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-2 text-sm font-medium text-muted-foreground">No users found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchTerm || roleFilter || statusFilter
                  ? 'Try adjusting your search criteria.'
                  : 'No users have been registered yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((userData) => (
              <div key={userData.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={userData.avatar_url} alt={userData.full_name} />
                    <AvatarFallback>{getInitials(userData.full_name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="font-medium">{userData.full_name}</p>
                      {getRoleBadge(userData.role)}
                      {getStatusBadge(userData.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{userData.email}</p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground mt-1">
                      {userData.department && (
                        <span>Department: {userData.department}</span>
                      )}
                      <span>Joined: {new Date(userData.created_at).toLocaleDateString()}</span>
                      <span>Last login: {userData.last_login === 'Never' ? 'Never' : new Date(userData.last_login).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Eye className="mr-2 h-4 w-4" />
                      View Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit User
                    </DropdownMenuItem>
                    {userData.status === 'active' ? (
                      <DropdownMenuItem>
                        <Ban className="mr-2 h-4 w-4" />
                        Suspend User
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Activate User
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete User
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              ))}
            </div>
          )}

          {!usersLoading && !error && filteredUsers.length > 0 && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={fetchUsers}
                disabled={usersLoading}
              >
                Refresh Users
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Roles Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            User Roles & Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-4 w-4 text-purple-600" />
                <h4 className="text-sm font-medium text-purple-800 dark:text-purple-300">
                  Super Admin
                </h4>
              </div>
              <p className="text-xs text-purple-700 dark:text-purple-400">
                Full system access, user management, and administrative controls
              </p>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Administrator
                </h4>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Manage content, documents, and chatbots within assigned scope
              </p>
            </div>

            <div className="p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-gray-600" />
                <h4 className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  User
                </h4>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-400">
                Basic access to chatbots and personal profile management
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}