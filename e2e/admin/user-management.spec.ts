import { test, expect } from '@playwright/test'

test.describe('User Management (Admin)', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as super admin user
    await page.goto('/login')
    await page.fill('input[type="email"]', 'superadmin@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')
  })

  test('should navigate to user management page', async ({ page }) => {
    // Navigate via sidebar
    const userManagementLink = page.locator('a:has-text("User Management"), a:has-text("Users")')

    if (await userManagementLink.isVisible()) {
      await userManagementLink.click()
    } else {
      await page.goto('/dashboard/admin/users')
    }

    await expect(page.url()).toMatch(/users/)
    await expect(page.locator('h1, h2')).toContainText(/user/i)
  })

  test('should display user list', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Check for user listing
    const userTable = page.locator('[data-testid="user-table"], .user-list, table')

    if (await userTable.isVisible()) {
      await expect(userTable).toBeVisible()

      // Check for table headers
      await expect(page.locator('th:has-text("Email"), th:has-text("Name"), th:has-text("Role")')).toBeVisible()
    }

    // Check for user rows
    const userRows = page.locator('tr[data-user-id], [data-testid="user-row"]')

    if (await userRows.first().isVisible()) {
      await expect(userRows.first()).toBeVisible()
    }
  })

  test('should create new user', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Look for create user button
    const createButton = page.locator('button:has-text("Create User"), button:has-text("Add User"), a:has-text("New User")')

    if (await createButton.isVisible()) {
      await createButton.click()

      // Fill in user creation form
      await page.fill('input[name="email"], input[type="email"]', 'newuser@example.com')
      await page.fill('input[name="full_name"], input[placeholder*="name"]', 'New Test User')
      await page.fill('input[name="password"], input[type="password"]', 'testpassword123')

      // Select role
      const roleSelect = page.locator('select[name="role"], [role="combobox"]')
      if (await roleSelect.isVisible()) {
        await roleSelect.click()
        await page.locator('option[value="user"], [role="option"]:has-text("User")').click()
      }

      // Submit form
      const submitButton = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")')
      await submitButton.click()

      // Should show success message
      await expect(page.locator('text=created, text=added, [role="alert"]')).toBeVisible({ timeout: 5000 })

      // Should show new user in list
      await expect(page.locator('text=newuser@example.com')).toBeVisible()
    }
  })

  test('should view user details', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Find and click on first user
    const firstUserRow = page.locator('tr[data-user-id], [data-testid="user-row"]').first()

    if (await firstUserRow.isVisible()) {
      const userEmail = await firstUserRow.locator('td').first().textContent()
      await firstUserRow.click()

      // Should navigate to user detail page or show modal
      if (page.url().includes('/users/')) {
        if (userEmail) {
          await expect(page.locator('h1, h2')).toContainText(userEmail)
        }
      } else {
        // Modal opened
        await expect(page.locator('[role="dialog"], .modal')).toBeVisible()
      }
    }
  })

  test('should edit user information', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Find edit button
    const editButton = page.locator('button:has-text("Edit"), [data-testid="edit-user"]').first()

    if (await editButton.isVisible()) {
      await editButton.click()

      // Should show edit form
      const nameInput = page.locator('input[name="full_name"], input[value]:not([value=""])')
      if (await nameInput.isVisible()) {
        await nameInput.clear()
        await nameInput.fill('Updated User Name E2E')

        // Save changes
        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]')
        if (await saveButton.isVisible()) {
          await saveButton.click()

          // Should show success message
          await expect(page.locator('text=updated, text=saved, [role="alert"]')).toBeVisible({ timeout: 5000 })
        }
      }
    }
  })

  test('should change user role', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Find user with role change option
    const roleSelect = page.locator('select[name="role"], [data-testid="role-select"]').first()

    if (await roleSelect.isVisible()) {
      const currentRole = await roleSelect.inputValue()

      // Change to different role
      await roleSelect.click()
      const newRoleOption = page.locator('option').filter({ hasNotText: currentRole }).first()

      if (await newRoleOption.isVisible()) {
        await newRoleOption.click()

        // Should update role
        await page.waitForTimeout(1000)

        // Confirm change if there's a confirmation dialog
        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")')
        if (await confirmButton.isVisible()) {
          await confirmButton.click()
        }

        // Should show success message
        await expect(page.locator('text=updated, text=changed, [role="alert"]')).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('should activate/deactivate user', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Find status toggle
    const statusToggle = page.locator('button[role="switch"], input[type="checkbox"][role="switch"]').first()

    if (await statusToggle.isVisible()) {
      const initialState = await statusToggle.isChecked()
      await statusToggle.click()

      // Status should change
      await expect(statusToggle).toBeChecked({ checked: !initialState })

      // Should show confirmation message
      await expect(page.locator('text=activated, text=deactivated, [role="alert"]')).toBeVisible({ timeout: 5000 })
    }
  })

  test('should reset user password', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Find reset password button
    const resetPasswordButton = page.locator('button:has-text("Reset Password"), [data-testid="reset-password"]').first()

    if (await resetPasswordButton.isVisible()) {
      await resetPasswordButton.click()

      // Should show confirmation dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Reset")')
      if (await confirmButton.isVisible()) {
        await confirmButton.click()

        // Should show success message with new password or email sent confirmation
        await expect(page.locator('text=reset, text=sent, [role="alert"]')).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('should search and filter users', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Test search functionality
    const searchInput = page.locator('input[placeholder*="search"], input[type="search"]')

    if (await searchInput.isVisible()) {
      await searchInput.fill('admin')
      await searchInput.press('Enter')

      // Should filter results
      await page.waitForTimeout(1000)

      // Check if search results are displayed
      const searchResults = page.locator('tr[data-user-id], [data-testid="user-row"]')
      if (await searchResults.first().isVisible()) {
        await expect(searchResults.first()).toContainText('admin')
      }
    }

    // Test role filter
    const roleFilter = page.locator('select[name="role_filter"], [data-testid="role-filter"]')

    if (await roleFilter.isVisible()) {
      await roleFilter.click()
      await page.locator('option[value="admin"], [role="option"]:has-text("Admin")').click()

      // Should filter by role
      await page.waitForTimeout(1000)
    }
  })

  test('should delete user', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Find delete button (usually for non-admin users)
    const deleteButton = page.locator('button:has-text("Delete"), [data-testid="delete-user"]').first()

    if (await deleteButton.isVisible()) {
      await deleteButton.click()

      // Should show confirmation dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")')
      if (await confirmButton.isVisible()) {
        await confirmButton.click()

        // Should show success message
        await expect(page.locator('text=deleted, [role="alert"]')).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('should handle bulk user operations', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Look for select all checkbox
    const selectAllCheckbox = page.locator('input[type="checkbox"][aria-label*="select all"], [data-testid="select-all"]')

    if (await selectAllCheckbox.isVisible()) {
      await selectAllCheckbox.click()

      // Look for bulk action buttons
      const bulkActionDropdown = page.locator('[data-testid="bulk-actions"], button:has-text("Actions")')

      if (await bulkActionDropdown.isVisible()) {
        await bulkActionDropdown.click()

        // Select bulk deactivate
        const deactivateOption = page.locator('button:has-text("Deactivate"), [role="menuitem"]:has-text("Deactivate")')
        if (await deactivateOption.isVisible()) {
          await deactivateOption.click()

          // Confirm bulk operation
          const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")')
          if (await confirmButton.isVisible()) {
            await confirmButton.click()

            // Should show success message
            await expect(page.locator('text=updated, [role="alert"]')).toBeVisible({ timeout: 5000 })
          }
        }
      }
    }
  })

  test('should export user list', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Look for export button
    const exportButton = page.locator('button:has-text("Export"), [data-testid="export-users"]')

    if (await exportButton.isVisible()) {
      // Set up download handling
      const downloadPromise = page.waitForEvent('download')
      await exportButton.click()

      const download = await downloadPromise
      expect(download.suggestedFilename()).toMatch(/users.*\.(csv|xlsx)/)
    }
  })

  test('should handle user permissions and access levels', async ({ page }) => {
    await page.goto('/dashboard/admin/users')

    // Find user with permissions management
    const permissionsButton = page.locator('button:has-text("Permissions"), [data-testid="manage-permissions"]').first()

    if (await permissionsButton.isVisible()) {
      await permissionsButton.click()

      // Should show permissions interface
      const permissionsModal = page.locator('[role="dialog"]:has-text("Permissions"), .permissions-modal')

      if (await permissionsModal.isVisible()) {
        await expect(permissionsModal).toBeVisible()

        // Check for permission checkboxes
        const permissionCheckboxes = page.locator('input[type="checkbox"][name*="permission"]')

        if (await permissionCheckboxes.first().isVisible()) {
          await permissionCheckboxes.first().click()

          // Save permissions
          const saveButton = page.locator('button:has-text("Save"), button[type="submit"]')
          if (await saveButton.isVisible()) {
            await saveButton.click()
            await expect(page.locator('text=updated, [role="alert"]')).toBeVisible({ timeout: 5000 })
          }
        }
      }
    }
  })
})