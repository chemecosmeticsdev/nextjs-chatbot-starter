"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Settings,
  Eye,
  EyeOff,
  Save,
  Bell,
  Globe,
  Palette
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface User {
  id: string
  email: string
  full_name: string
  role: string
}

interface ProfileData {
  full_name: string
  email: string
  phone: string
  bio: string
  location: string
  department: string
  joined_date: string
  avatar_url: string
}

interface PasswordData {
  current_password: string
  new_password: string
  confirm_password: string
}

interface Preferences {
  language: string
  theme: string
  email_notifications: boolean
  push_notifications: boolean
  marketing_emails: boolean
  security_alerts: boolean
}

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false)
  const [showNewPassword, setShowNewPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)

  const [profileData, setProfileData] = React.useState<ProfileData>({
    full_name: '',
    email: '',
    phone: '',
    bio: '',
    location: '',
    department: '',
    joined_date: '',
    avatar_url: ''
  })

  const [passwordData, setPasswordData] = React.useState<PasswordData>({
    current_password: '',
    new_password: '',
    confirm_password: ''
  })

  const [preferences, setPreferences] = React.useState<Preferences>({
    language: 'english',
    theme: 'system',
    email_notifications: true,
    push_notifications: true,
    marketing_emails: false,
    security_alerts: true
  })

  React.useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/v1/auth/me')
      const data = await response.json()

      if (response.ok && data.success) {
        setUser(data.user)
        // Load user profile data
        setProfileData({
          full_name: data.user.full_name || '',
          email: data.user.email || '',
          phone: '+1 (555) 123-4567',
          bio: 'Experienced developer passionate about AI and chatbot technologies.',
          location: 'San Francisco, CA',
          department: 'Engineering',
          joined_date: '2024-01-01',
          avatar_url: ''
        })
      } else {
        router.push('/login')
      }
    } catch (error) {
      console.error('Error checking auth:', error)
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    // Simulate save operation
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSaving(false)
    // Show success message
    alert('Profile updated successfully!')
  }

  const handleChangePassword = async () => {
    if (passwordData.new_password !== passwordData.confirm_password) {
      alert('New passwords do not match!')
      return
    }
    if (passwordData.new_password.length < 8) {
      alert('Password must be at least 8 characters long!')
      return
    }
    
    setSaving(true)
    // Simulate password change
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSaving(false)
    
    // Clear form
    setPasswordData({
      current_password: '',
      new_password: '',
      confirm_password: ''
    })
    alert('Password changed successfully!')
  }

  const handleSavePreferences = async () => {
    setSaving(true)
    // Simulate save operation
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSaving(false)
    alert('Preferences saved successfully!')
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase()
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin': return <Badge className="bg-purple-100 text-purple-700">Super Admin</Badge>
      case 'admin': return <Badge className="bg-blue-100 text-blue-700">Admin</Badge>
      case 'user': return <Badge className="bg-gray-100 text-gray-700">User</Badge>
      default: return <Badge variant="secondary">{role}</Badge>
    }
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

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-muted-foreground">
            Manage your account information and preferences
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Profile Overview */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <Avatar className="h-24 w-24 mx-auto mb-4">
              <AvatarImage src={profileData.avatar_url} alt={profileData.full_name} />
              <AvatarFallback className="text-lg">
                {getInitials(profileData.full_name)}
              </AvatarFallback>
            </Avatar>
            <h3 className="font-semibold text-lg mb-1">{profileData.full_name}</h3>
            <p className="text-sm text-muted-foreground mb-2">{profileData.email}</p>
            <div className="flex justify-center mb-4">
              {getRoleBadge(user.role)}
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              {profileData.department && (
                <div className="flex items-center justify-center gap-1">
                  <Shield className="h-3 w-3" />
                  <span>{profileData.department}</span>
                </div>
              )}
              {profileData.location && (
                <div className="flex items-center justify-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>{profileData.location}</span>
                </div>
              )}
              <div className="flex items-center justify-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Joined {profileData.joined_date}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Information */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Update your personal details and contact information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={profileData.full_name}
                  onChange={(e) => setProfileData(prev => ({ ...prev, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={profileData.phone}
                  onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={profileData.location}
                  onChange={(e) => setProfileData(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself..."
                value={profileData.bio}
                onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                rows={3}
              />
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? (
                <>
                  <Settings className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Update your password to keep your account secure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="current_password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="current_password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={passwordData.current_password}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, current_password: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new_password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new_password"
                    type={showNewPassword ? "text" : "password"}
                    value={passwordData.new_password}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, new_password: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirm_password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={passwordData.confirm_password}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirm_password: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <Button onClick={handleChangePassword} disabled={saving}>
                {saving ? (
                  <>
                    <Settings className="mr-2 h-4 w-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  "Change Password"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Preferences
            </CardTitle>
            <CardDescription>
              Customize your experience and notification settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Display Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Display & Language
                </h3>
                
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={preferences.language} onValueChange={(value) => setPreferences(prev => ({ ...prev, language: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="english">English</SelectItem>
                      <SelectItem value="spanish">Spanish</SelectItem>
                      <SelectItem value="french">French</SelectItem>
                      <SelectItem value="german">German</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select value={preferences.theme} onValueChange={(value) => setPreferences(prev => ({ ...prev, theme: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notification Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Notifications
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Email Notifications</Label>
                      <p className="text-xs text-muted-foreground">Receive notifications via email</p>
                    </div>
                    <Switch
                      checked={preferences.email_notifications}
                      onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, email_notifications: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Push Notifications</Label>
                      <p className="text-xs text-muted-foreground">Receive browser notifications</p>
                    </div>
                    <Switch
                      checked={preferences.push_notifications}
                      onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, push_notifications: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Marketing Emails</Label>
                      <p className="text-xs text-muted-foreground">Receive product updates and tips</p>
                    </div>
                    <Switch
                      checked={preferences.marketing_emails}
                      onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, marketing_emails: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Security Alerts</Label>
                      <p className="text-xs text-muted-foreground">Important security notifications</p>
                    </div>
                    <Switch
                      checked={preferences.security_alerts}
                      onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, security_alerts: checked }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <Button onClick={handleSavePreferences} disabled={saving}>
                {saving ? (
                  <>
                    <Settings className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Preferences
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}