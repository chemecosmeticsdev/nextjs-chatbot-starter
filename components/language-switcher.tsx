"use client"

import * as React from "react"
import { Globe } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' },
]

export function LanguageSwitcher() {
  const [currentLanguage, setCurrentLanguage] = React.useState('en')

  React.useEffect(() => {
    // Load saved language preference from localStorage
    const savedLanguage = localStorage.getItem('preferred-language')
    if (savedLanguage && languages.find(lang => lang.code === savedLanguage)) {
      setCurrentLanguage(savedLanguage)
    } else {
      // Default to English for now (will be Thai when requested)
      setCurrentLanguage('en')
    }
  }, [])

  const handleLanguageChange = (languageCode: string) => {
    setCurrentLanguage(languageCode)
    // Save language preference to localStorage
    localStorage.setItem('preferred-language', languageCode)

    // Update user preference in database (placeholder for future API integration)
    updateUserLanguagePreference(languageCode)

    console.log(`Language changed to: ${languageCode}`)
  }

  const updateUserLanguagePreference = async (languageCode: string) => {
    try {
      // Placeholder for API call to update user language preference
      // This will be implemented when user profile API is ready
      console.log(`Updating user language preference to: ${languageCode}`)
    } catch (error) {
      console.error('Failed to update language preference:', error)
    }
  }


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Globe className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Switch language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className={currentLanguage === language.code ? "bg-accent" : ""}
          >
            <span className="mr-2">{language.flag}</span>
            {language.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}