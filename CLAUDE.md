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

## Development Workflow

1. Use shadcn MCP server for component discovery and implementation
2. Leverage AWS knowledge MCP server for service integration
3. Use specialized agents for complex development tasks
4. Deploy automatically through GitHub → AWS Amplify pipeline
5. Monitor and debug using AWS services in ap-southeast-1 region (Bedrock in us-east-1)