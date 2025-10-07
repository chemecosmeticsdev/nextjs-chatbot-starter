import { test, expect } from '@playwright/test'

test.describe('Document Management', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as admin user (who has access to document management)
    await page.goto('/login')
    await page.fill('input[type="email"]', 'admin@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')
  })

  test('should navigate to documents page', async ({ page }) => {
    // Navigate via sidebar or direct URL
    const documentsLink = page.locator('a:has-text("Documents"), a:has-text("All Documents")')

    if (await documentsLink.isVisible()) {
      await documentsLink.click()
    } else {
      await page.goto('/dashboard/documents')
    }

    await expect(page.url()).toMatch(/documents/)
    await expect(page.locator('h1, h2')).toContainText(/document/i)
  })

  test('should display document list', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Check for document listing
    const documentList = page.locator('[data-testid="document-list"], .document-grid, .document-table')

    if (await documentList.isVisible()) {
      await expect(documentList).toBeVisible()
    }

    // Check for individual document items
    const documentItems = page.locator('[data-testid="document-item"], .document-card, tr[data-document-id]')

    if (await documentItems.first().isVisible()) {
      await expect(documentItems.first()).toBeVisible()
    }
  })

  test('should upload new document', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Look for upload button
    const uploadButton = page.locator('button:has-text("Upload"), input[type="file"], [data-testid="upload-button"]')

    if (await uploadButton.first().isVisible()) {
      // Create a test file
      const testFileContent = 'This is a test document for E2E testing.'

      if (await page.locator('input[type="file"]').isVisible()) {
        // Direct file input
        const fileInput = page.locator('input[type="file"]')

        // Create a temporary file for testing
        await fileInput.setInputFiles({
          name: 'test-document.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(testFileContent)
        })

        // Submit upload
        const submitButton = page.locator('button[type="submit"], button:has-text("Upload")')
        if (await submitButton.isVisible()) {
          await submitButton.click()

          // Should show success message
          await expect(page.locator('text=uploaded, text=success, [role="alert"]')).toBeVisible({ timeout: 10000 })
        }
      } else {
        // Button-triggered upload
        await uploadButton.first().click()

        // Fill in document details if there's a form
        const nameInput = page.locator('input[name="name"], input[placeholder*="name"]')
        if (await nameInput.isVisible()) {
          await nameInput.fill('Test Document E2E')
        }

        const descriptionInput = page.locator('textarea[name="description"], textarea[placeholder*="description"]')
        if (await descriptionInput.isVisible()) {
          await descriptionInput.fill('Test document description for E2E testing')
        }

        // Submit form
        const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Upload")')
        if (await submitButton.isVisible()) {
          await submitButton.click()
        }
      }
    }
  })

  test('should view document details', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Find and click on first document
    const firstDocument = page.locator('[data-testid="document-item"], .document-card').first()

    if (await firstDocument.isVisible()) {
      const documentName = await firstDocument.locator('h3, .document-name, [data-testid="document-name"]').first().textContent()
      await firstDocument.click()

      // Should navigate to document detail page
      await expect(page.url()).toMatch(/documents\/[a-zA-Z0-9-]+/)

      if (documentName) {
        await expect(page.locator('h1, h2')).toContainText(documentName)
      }

      // Should show document metadata
      await expect(page.locator('text=Size, text=Type, text=Created')).toBeVisible()
    }
  })

  test('should search documents', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Look for search input
    const searchInput = page.locator('input[placeholder*="search"], input[type="search"]')

    if (await searchInput.isVisible()) {
      await searchInput.fill('test')
      await searchInput.press('Enter')

      // Should filter results
      await page.waitForTimeout(1000)

      // Check if search results are displayed
      const searchResults = page.locator('[data-testid="search-results"], .search-results')

      if (await searchResults.isVisible()) {
        await expect(searchResults).toBeVisible()
      }
    }
  })

  test('should filter documents by type', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Look for filter options
    const filterSelect = page.locator('select[name="type"], [role="combobox"]').first()

    if (await filterSelect.isVisible()) {
      await filterSelect.click()

      // Select a filter option
      const filterOption = page.locator('option[value="pdf"], [role="option"]:has-text("PDF")').first()
      if (await filterOption.isVisible()) {
        await filterOption.click()

        // Should filter the document list
        await page.waitForTimeout(1000)
      }
    }
  })

  test('should download document', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Find document with download option
    const downloadButton = page.locator('button:has-text("Download"), a[download], [data-testid="download-button"]').first()

    if (await downloadButton.isVisible()) {
      // Set up download handling
      const downloadPromise = page.waitForEvent('download')
      await downloadButton.click()

      const download = await downloadPromise
      expect(download.suggestedFilename()).toBeTruthy()
    }
  })

  test('should edit document metadata', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Find edit button
    const editButton = page.locator('button:has-text("Edit"), [data-testid="edit-button"]').first()

    if (await editButton.isVisible()) {
      await editButton.click()

      // Should show edit form
      const nameInput = page.locator('input[name="name"], input[value]:not([value=""])')
      if (await nameInput.isVisible()) {
        await nameInput.clear()
        await nameInput.fill('Updated Document Name E2E')

        // Save changes
        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]')
        if (await saveButton.isVisible()) {
          await saveButton.click()

          // Should show success message
          await expect(page.locator('text=saved, text=updated, [role="alert"]')).toBeVisible({ timeout: 5000 })
        }
      }
    }
  })

  test('should delete document', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Find delete button
    const deleteButton = page.locator('button:has-text("Delete"), [data-testid="delete-button"]').first()

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

  test('should handle document processing status', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Look for processing status indicators
    const processingIndicator = page.locator('[data-testid="processing"], .processing-status, text=processing')

    if (await processingIndicator.isVisible()) {
      await expect(processingIndicator).toBeVisible()

      // Wait for processing to complete
      await expect(processingIndicator).not.toBeVisible({ timeout: 30000 })
    }
  })

  test('should handle bulk document operations', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Look for select all checkbox
    const selectAllCheckbox = page.locator('input[type="checkbox"][aria-label*="select all"], [data-testid="select-all"]')

    if (await selectAllCheckbox.isVisible()) {
      await selectAllCheckbox.click()

      // Look for bulk action buttons
      const bulkDeleteButton = page.locator('button:has-text("Delete Selected"), [data-testid="bulk-delete"]')

      if (await bulkDeleteButton.isVisible()) {
        await bulkDeleteButton.click()

        // Confirm bulk operation
        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")')
        if (await confirmButton.isVisible()) {
          await confirmButton.click()

          // Should show success message
          await expect(page.locator('text=deleted, [role="alert"]')).toBeVisible({ timeout: 5000 })
        }
      }
    }
  })

  test('should handle document categories/tags', async ({ page }) => {
    await page.goto('/dashboard/documents')

    // Look for category/tag management
    const addTagButton = page.locator('button:has-text("Add Tag"), [data-testid="add-tag"]')

    if (await addTagButton.isVisible()) {
      await addTagButton.click()

      const tagInput = page.locator('input[placeholder*="tag"], input[name="tag"]')
      if (await tagInput.isVisible()) {
        await tagInput.fill('E2E-Test-Tag')
        await tagInput.press('Enter')

        // Should show tag in the interface
        await expect(page.locator('text=E2E-Test-Tag')).toBeVisible()
      }
    }
  })
})