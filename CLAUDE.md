# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js + shadcn/ui development environment configured for building chatbot applications with the following stack:

- **Frontend**: Next.js with shadcn/ui components
- **Database**: Neon PostgreSQL (both vector and relational data)
- **LLM Provider**: AWS Bedrock (primary, Nova Micro model)
- **Cloud Services**: AWS (Lambda, API Gateway, document processing)
- **Deployment**: AWS Amplify with GitHub CI/CD integration
- **Regions**: ap-southeast-1 (primary), us-east-1 (Bedrock)

## Development Commands

Currently, this is a minimal setup with only basic dependencies:
- `npm install` - Install dependencies (currently only shadcn)
- Use shadcn CLI via `npx shadcn@latest` for component management

## MCP Server Configuration

The project is configured with specialized MCP servers:

### shadcn Server
- Provides shadcn/ui component management and examples
- Use for component discovery, implementation, and design decisions

### aws-knowledge-mcp-server
- Provides access to AWS documentation and knowledge
- Use for AWS service integration, documentation lookup, and best practices

## Environment Configuration

Key environment variables are configured in `.env.local`:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `BAWS_ACCESS_KEY_ID` / `BAWS_SECRET_ACCESS_KEY` - AWS credentials (BAWS prefix for Amplify)
- `DEFAULT_REGION` - ap-southeast-1 (primary AWS region)
- `BEDROCK_REGION` - us-east-1 (required for AWS Bedrock)
- `GITHUB_PAT` - GitHub Personal Access Token for CI/CD

**IMPORTANT**: Never modify credentials in .env.local - only read existing values or add new lines.

## Neon Database Configuration

**CRITICAL**: Always use the correct Neon project to avoid data integrity issues.

### Correct Project Details:
- **Project ID**: `orange-credit-10889790`
- **Project Name**: "cloudshell-chatbot"
- **Database URL**: Points to `ep-polished-band-a1rdok0t-pooler.ap-southeast-1.aws.neon.tech`
- **Default Branch**: `br-muddy-king-a1la4k1e`

### MCP Neon Tools Usage:
**ALWAYS specify the correct projectId when using Neon MCP tools:**
```javascript
// Correct usage - always specify projectId
mcp__neon__run_sql({
  sql: "SELECT * FROM table",
  projectId: "orange-credit-10889790"
})

// WRONG - letting MCP auto-select project can connect to wrong database
mcp__neon__run_sql({ sql: "SELECT * FROM table" })
```

### Available Projects (DO NOT USE):
- `old-unit-76511442` ("chatbot") - Wrong project, do not use
- `plain-glade-58968287` ("langchain-aws") - Different application

### Database Schema:
The correct database contains these tables:
- `system_settings` - Admin configuration settings
- `users` - User management
- `documents` - Document storage metadata
- `document_chunks` - Vector embeddings
- `activity_logs` - Audit trails
- `products`, `suppliers` - Business data
- `search_queries`, `search_results_cache` - Search functionality

## Specialized Agents

The project is configured to leverage specialized Claude Code agents:
- `nextjs-frontend-engineer` - For Next.js frontend development and optimization
- `shadcn-ui-designer` - For shadcn/ui component implementation and design
- `serverless-backend-architect` - For serverless backend and database architecture
- `aws-cli-engineer` - For AWS infrastructure management and CLI operations
- `github-devops-engineer` - For GitHub CI/CD pipeline management

## Architecture Guidelines

- Use agents and MCP servers extensively for debugging and development
- Prefer archiving over deleting packages/dependencies during troubleshooting
- AWS Bedrock Nova Micro is the default LLM model
- GitHub integration enables automatic deployment via AWS Amplify
- Database operations should utilize Neon's PostgreSQL capabilities for both vector and relational data

### Database Layer Architecture

- **Drizzle ORM**: Used for all regular database operations (CRUD, transactions, schema management)
  - Type-safe database operations with full TypeScript support
  - Connection pooling and SSL configuration handled automatically
  - Located in `lib/db/` directory with modular services
- **Direct SQL**: Reserved exclusively for vector similarity searches and performance-critical operations
- **Schema Management**: All database schemas defined in `lib/db/schema.ts` with proper TypeScript types

## Development Workflow

1. Use shadcn MCP server for component discovery and implementation
2. Leverage AWS knowledge MCP server for service integration
3. Use specialized agents for complex development tasks
4. Deploy automatically through GitHub → AWS Amplify pipeline
5. Monitor and debug using AWS services in ap-southeast-1 region (Bedrock in us-east-1)