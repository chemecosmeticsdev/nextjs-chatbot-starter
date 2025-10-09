import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stepFunctionExecutions } from '@/lib/db/schema';
import { desc, eq, and, like, gte, lte, count } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Max 100 items
    const offset = (page - 1) * limit;

    // Filter parameters
    const status = searchParams.get('status');
    const fileName = searchParams.get('fileName');
    const uploadedBy = searchParams.get('uploadedBy');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where conditions
    const whereConditions = [];

    if (status) {
      whereConditions.push(eq(stepFunctionExecutions.status, status));
    }

    if (fileName) {
      whereConditions.push(like(stepFunctionExecutions.fileName, `%${fileName}%`));
    }

    if (uploadedBy) {
      whereConditions.push(eq(stepFunctionExecutions.uploadedBy, uploadedBy));
    }

    if (startDate) {
      whereConditions.push(gte(stepFunctionExecutions.startedAt, new Date(startDate)));
    }

    if (endDate) {
      whereConditions.push(lte(stepFunctionExecutions.startedAt, new Date(endDate)));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: count() })
      .from(stepFunctionExecutions)
      .where(whereClause);

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Get executions with pagination
    const executions = await db
      .select({
        id: stepFunctionExecutions.id,
        documentId: stepFunctionExecutions.documentId,
        fileName: stepFunctionExecutions.fileName,
        fileKey: stepFunctionExecutions.fileKey,
        status: stepFunctionExecutions.status,
        startedAt: stepFunctionExecutions.startedAt,
        endedAt: stepFunctionExecutions.endedAt,
        uploadedBy: stepFunctionExecutions.uploadedBy,
        error: stepFunctionExecutions.error
      })
      .from(stepFunctionExecutions)
      .where(whereClause)
      .orderBy(desc(stepFunctionExecutions.startedAt))
      .limit(limit)
      .offset(offset);

    // Calculate duration and add additional info for each execution
    const enrichedExecutions = executions.map(execution => {
      const startTime = execution.startedAt;
      const endTime = execution.endedAt;
      const durationMs = endTime && startTime ? endTime.getTime() - startTime.getTime() : null;

      // Determine if execution is still active
      const isActive = ['RUNNING', 'PENDING'].includes(execution.status);

      return {
        ...execution,
        durationMs,
        isActive,
        // Calculate current duration for running executions
        currentDurationMs: isActive && startTime ? new Date().getTime() - startTime.getTime() : durationMs
      };
    });

    // Get status summary
    const statusSummary = await db
      .select({
        status: stepFunctionExecutions.status,
        count: count()
      })
      .from(stepFunctionExecutions)
      .where(whereClause)
      .groupBy(stepFunctionExecutions.status);

    const summary = {
      total: totalCount,
      byStatus: Object.fromEntries(
        statusSummary.map(item => [item.status, item.count])
      )
    };

    return NextResponse.json({
      executions: enrichedExecutions,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      summary,
      filters: {
        status,
        fileName,
        uploadedBy,
        startDate,
        endDate
      }
    });

  } catch (error) {
    console.error('Failed to fetch executions:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch executions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE endpoint to clean up old executions
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parameters for cleanup
    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '30');
    const status = searchParams.get('status'); // Optional: only delete executions with specific status
    const dryRun = searchParams.get('dryRun') === 'true';

    if (olderThanDays < 7) {
      return NextResponse.json(
        { error: 'Cannot delete executions newer than 7 days' },
        { status: 400 }
      );
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Build where conditions
    const whereConditions = [
      lte(stepFunctionExecutions.startedAt, cutoffDate)
    ];

    if (status) {
      whereConditions.push(eq(stepFunctionExecutions.status, status));
    }

    const whereClause = and(...whereConditions);

    if (dryRun) {
      // Just count what would be deleted
      const countResult = await db
        .select({ count: count() })
        .from(stepFunctionExecutions)
        .where(whereClause);

      return NextResponse.json({
        dryRun: true,
        wouldDelete: countResult[0]?.count || 0,
        cutoffDate: cutoffDate.toISOString(),
        status: status || 'all'
      });
    }

    // Actually delete the records
    const deleteResult = await db
      .delete(stepFunctionExecutions)
      .where(whereClause);

    return NextResponse.json({
      success: true,
      deleted: deleteResult.rowCount || 0,
      cutoffDate: cutoffDate.toISOString(),
      status: status || 'all'
    });

  } catch (error) {
    console.error('Failed to clean up executions:', error);

    return NextResponse.json(
      {
        error: 'Failed to clean up executions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}