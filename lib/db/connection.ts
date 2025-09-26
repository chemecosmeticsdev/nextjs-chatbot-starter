import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Create postgres client
const client = postgres(process.env.DATABASE_URL!, {
  max: 10, // Maximum number of connections in the pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  ssl: 'require', // Always require SSL for Neon
});

// Create Drizzle database instance
export const db = drizzle(client, { schema });

// Type for database instance
export type Database = typeof db;

// Helper function to close connection (useful for testing)
export const closeConnection = async () => {
  await client.end();
};