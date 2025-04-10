// scripts/generate.ts
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import inquirer, { Answers } from 'inquirer';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { program } from 'commander';

// Configuration
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const templatesDir = path.join(__dirname, 'templates');
const srcDir = path.join(rootDir, 'src');

// Set up command line arguments
program
  .name('generate')
  .description(
    'Generate module files for your Node.js application optimized for Cloud Run',
  )
  .option('-n, --name <name>', 'Module name (singular, e.g., "user")')
  .option('-p, --plural <plural>', 'Plural form of the module name')
  .option(
    '-t, --types <types>',
    'Module types to generate (comma-separated: controller,route,service,test,model)',
  )
  .option('-a, --all', 'Generate all module types')
  .option('-c, --cloud-run', 'Add Cloud Run specific configurations', true)
  .option('-b, --base-path <path>', 'Base API path for the module', '/api/v1')
  .option('-y, --yes', 'Skip confirmation prompts')
  .parse(process.argv);

const options = program.opts();

// Default templates (can be overridden by files in templatesDir)
const defaultTemplates: Record<string, string> = {
  'controller.ts': `// src/controllers/{{name}}.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
// Fixed: Import the service class/instance
import { {{Name}}Service } from '../services/{{name}}.service.js'; // Assuming named export or adjust if default
import { logger } from '../utils/logger.js';

// Fixed: Instantiate service ONCE per module (or use dependency injection)
const service = new {{Name}}Service();

/**
 * @swagger
 * {{basePath}}/{{namePlural}}:
 * get:
 * summary: Get all {{namePlural}}
 * tags: [{{Name}}]
 * responses:
 * 200:
 * description: List of {{namePlural}}
 * 500:
 * description: Server error
 */
export async function getAll{{Name}}(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Fixed: Use the module-level service instance
    // const service = new {{Name}}Service();
    logger.info({ req }, 'Getting all {{namePlural}}');

    const result = await service.getAll();
    res.json(result);
  } catch (error) {
    logger.error({ req, error }, 'Error getting all {{namePlural}}');
    next(error);
  }
}

/**
 * @swagger
 * {{basePath}}/{{namePlural}}/{id}:
 * get:
 * summary: Get {{name}} by ID
 * tags: [{{Name}}]
 * parameters:
 * - name: id
 * in: path
 * required: true
 * schema:
 * type: string
 * responses:
 * 200:
 * description: {{Name}} details
 * 404:
 * description: {{Name}} not found
 * 500:
 * description: Server error
 */
export async function get{{Name}}ById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    logger.info({ req, id }, 'Getting {{name}} by ID');

    // Fixed: Use the module-level service instance
    // const service = new {{Name}}Service();
    const result = await service.getById(id);

    if (!result.data) {
      res.status(404).json({ error: '{{Name}} not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    logger.error({ req, error }, 'Error getting {{name}} by ID');
    next(error);
  }
}

/**
 * @swagger
 * {{basePath}}/{{namePlural}}:
 * post:
 * summary: Create a new {{name}}
 * tags: [{{Name}}]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * $ref: '#/components/schemas/{{Name}}Create'
 * responses:
 * 201:
 * description: {{Name}} created successfully
 * 400:
 * description: Invalid input
 * 500:
 * description: Server error
 */
export async function create{{Name}}(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Validate input with Zod
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      // Add more fields as needed
    });

    const validationResult = schema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.format()
      });
      return;
    }

    const data = validationResult.data;
    logger.info({ req, data }, 'Creating new {{name}}');

    // Fixed: Use the module-level service instance
    // const service = new {{Name}}Service();
    const result = await service.create(data);

    res.status(201).json(result);
  } catch (error) {
    logger.error({ req, error }, 'Error creating {{name}}');
    next(error);
  }
}

/**
 * @swagger
 * {{basePath}}/{{namePlural}}/{id}:
 * put:
 * summary: Update a {{name}}
 * tags: [{{Name}}]
 * parameters:
 * - name: id
 * in: path
 * required: true
 * schema:
 * type: string
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * $ref: '#/components/schemas/{{Name}}Update'
 * responses:
 * 200:
 * description: {{Name}} updated successfully
 * 404:
 * description: {{Name}} not found
 * 500:
 * description: Server error
 */
export async function update{{Name}}(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    // Validate input with Zod
    const schema = z.object({
      name: z.string().min(1, 'Name is required').optional(),
      // Add more fields as needed
    });

    const validationResult = schema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.format()
      });
      return;
    }

    const data = validationResult.data;
    logger.info({ req, id, data }, 'Updating {{name}}');

    // Fixed: Use the module-level service instance
    // const service = new {{Name}}Service();
    const result = await service.update(id, data);

    if (!result.data) {
      res.status(404).json({ error: '{{Name}} not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    logger.error({ req, error }, 'Error updating {{name}}');
    next(error);
  }
}

/**
 * @swagger
 * {{basePath}}/{{namePlural}}/{id}:
 * delete:
 * summary: Delete a {{name}}
 * tags: [{{Name}}]
 * parameters:
 * - name: id
 * in: path
 * required: true
 * schema:
 * type: string
 * responses:
 * 200:
 * description: {{Name}} deleted successfully
 * 404:
 * description: {{Name}} not found
 * 500:
 * description: Server error
 */
export async function delete{{Name}}(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    logger.info({ req, id }, 'Deleting {{name}}');

    // Fixed: Use the module-level service instance
    // const service = new {{Name}}Service();
    const result = await service.delete(id);

    if (!result.success) {
      res.status(404).json({ error: '{{Name}} not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    logger.error({ req, error }, 'Error deleting {{name}}');
    next(error);
  }
}
`,

  'service.ts': `// src/services/{{name}}.service.ts
// Fixed: Import shared Prisma Client instance
import prisma from '../lib/prisma.js'; // Adjust path if your shared client is elsewhere
import { logger } from '../utils/logger.js';
// Removed: import { PrismaClient } from '@prisma/client'; // Don't import directly here

/**
 * Service for {{name}} operations
 * Optimized for Cloud Run with proper connection handling via shared client
 */
export class {{Name}}Service {
  // Fixed: Remove constructor and internal Prisma Client instance
  // private prisma: PrismaClient;
  // constructor() { ... }

  /**
   * Get all {{namePlural}}
   * @returns {Promise<{success: boolean, data?: any[], count?: number, error?: any}>}
   */
  async getAll() {
    try {
      // Fixed: Use the imported shared 'prisma' instance
      const {{namePlural}} = await prisma.{{name}}.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return {
        success: true,
        data: {{namePlural}},
        count: {{namePlural}}.length
      };
    } catch (error: any) { // Added type annotation for error
      logger.error({ error }, 'Error getting all {{namePlural}}');

      // Handle specific Prisma errors
      if (error.code === 'P2002') { // Example Prisma error code
        return { success: false, error: 'Unique constraint failed' };
      }

      return { success: false, error: 'Failed to get {{namePlural}}' };
    }
    // Fixed: Remove finally block with $disconnect()
    // finally { await this.prisma.$disconnect(); }
  }

  /**
   * Get {{name}} by ID
   * @param {string} id - The {{name}} ID
   * @returns {Promise<{success: boolean, data?: any, error?: any}>}
   */
  async getById(id: string) {
    try {
      // Fixed: Use the imported shared 'prisma' instance
      const {{name}} = await prisma.{{name}}.findUnique({
        where: { id },
      });

      if (!{{name}}) {
        return { success: false, error: '{{Name}} not found' };
      }

      return { success: true, data: {{name}} };
    } catch (error: any) { // Added type annotation for error
      logger.error({ error, id }, 'Error getting {{name}} by ID');
      return { success: false, error: 'Failed to get {{name}}' };
    }
    // Fixed: Remove finally block with $disconnect()
    // finally { await this.prisma.$disconnect(); }
  }

  /**
   * Create a new {{name}}
   * @param {any} data - The {{name}} data (Consider using specific DTOs/Types)
   * @returns {Promise<{success: boolean, data?: any, error?: any}>}
   */
  async create(data: any) { // Consider using a specific type for 'data'
    try {
      // Fixed: Use the imported shared 'prisma' instance
      const {{name}} = await prisma.{{name}}.create({
        data,
      });

      return {
        success: true,
        data: {{name}},
      };
    } catch (error: any) { // Added type annotation for error
      logger.error({ error, data }, 'Error creating {{name}}');

      if (error.code === 'P2002') { // Example Prisma error code
        return {
          success: false,
          error: 'A {{name}} with this identifier already exists'
        };
      }

      return { success: false, error: 'Failed to create {{name}}' };
    }
    // Fixed: Remove finally block with $disconnect()
    // finally { await this.prisma.$disconnect(); }
  }

  /**
   * Update a {{name}}
   * @param {string} id - The {{name}} ID
   * @param {any} data - The {{name}} data (Consider using specific DTOs/Types)
   * @returns {Promise<{success: boolean, data?: any, error?: any}>}
   */
  async update(id: string, data: any) { // Consider using a specific type for 'data'
    try {
      // Check if exists first using the shared client
      const exists = await prisma.{{name}}.findUnique({
        where: { id },
        select: { id: true } // Only select 'id' for existence check
      });

      if (!exists) {
        return { success: false, error: '{{Name}} not found' };
      }

      // Fixed: Use the imported shared 'prisma' instance
      const updated{{Name}} = await prisma.{{name}}.update({
        where: { id },
        data,
      });

      return {
        success: true,
        data: updated{{Name}}
      };
    } catch (error: any) { // Added type annotation for error
      logger.error({ error, id, data }, 'Error updating {{name}}');
      // Handle Prisma P2025 (Record to update not found) if needed, though the check above handles it
      // if (error.code === 'P2025') {
      //   return { success: false, error: '{{Name}} not found during update' };
      // }
      return { success: false, error: 'Failed to update {{name}}' };
    }
    // Fixed: Remove finally block with $disconnect()
    // finally { await this.prisma.$disconnect(); }
  }

  /**
   * Delete a {{name}}
   * @param {string} id - The {{name}} ID
   * @returns {Promise<{success: boolean, error?: any}>}
   */
  async delete(id: string) {
    try {
      // Check if exists first using the shared client
      const exists = await prisma.{{name}}.findUnique({
        where: { id },
        select: { id: true } // Only select 'id' for existence check
      });

      if (!exists) {
        return { success: false, error: '{{Name}} not found' };
      }

      // Fixed: Use the imported shared 'prisma' instance
      await prisma.{{name}}.delete({
        where: { id },
      });

      return { success: true };
    } catch (error: any) { // Added type annotation for error
      logger.error({ error, id }, 'Error deleting {{name}}');
       // Handle Prisma P2025 (Record to delete not found) if needed, though the check above handles it
      // if (error.code === 'P2025') {
      //   return { success: false, error: '{{Name}} not found during delete' };
      // }
      return { success: false, error: 'Failed to delete {{name}}' };
    }
    // Fixed: Remove finally block with $disconnect()
    // finally { await this.prisma.$disconnect(); }
  }
}

// Export the class directly or a singleton instance depending on your DI strategy
// If using singleton pattern across the app:
// export default new {{Name}}Service();
// If using DI or manual instantiation elsewhere:
export { {{Name}}Service }; // Export the class
`,

  'route.ts': `// src/routes/{{name}}.routes.ts
import { Router } from 'express';
import {
  getAll{{Name}},
  get{{Name}}ById,
  create{{Name}},
  update{{Name}},
  delete{{Name}},
} from '../controllers/{{name}}.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 * name: {{Name}}
 * description: {{Name}} management endpoints
 */

// {{Name}} endpoints
router.get('{{basePath}}/{{namePlural}}', getAll{{Name}});
router.get('{{basePath}}/{{namePlural}}/:id', get{{Name}}ById);
router.post('{{basePath}}/{{namePlural}}', create{{Name}});
router.put('{{basePath}}/{{namePlural}}/:id', update{{Name}});
router.delete('{{basePath}}/{{namePlural}}/:id', delete{{Name}});

export default router;
`,

  'test.ts': `// src/tests/{{name}}.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js'; // Assuming your Express app is exported from app.ts
// Import the service to potentially mock its methods if needed, or rely on Prisma mock
// import { {{Name}}Service } from '../services/{{name}}.service.js';

const request = supertest(app);

// Mock the SHARED Prisma client instance expected by the service
vi.mock('../lib/prisma.js', () => { // Mock the path to your shared client
  const mockPrismaClient = {
    {{name}}: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    // $disconnect: vi.fn(), // No longer need to mock disconnect if not called
  };
  // Default export is the client instance
  return { default: mockPrismaClient };
});


describe('{{Name}} API', () => {
  let prismaClient: any; // Type appropriately if possible

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
     // Get the mocked client instance
    prismaClient = (vi.mocked((await import('../lib/prisma.js')).default));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET {{basePath}}/{{namePlural}}', () => {
    it('should return all {{namePlural}} successfully', async () => {
      // Arrange
      const mock{{NamePlural}} = [
        { id: '1', name: 'Test 1', createdAt: new Date(), updatedAt: new Date() },
        { id: '2', name: 'Test 2', createdAt: new Date(), updatedAt: new Date() },
      ];
      prismaClient.{{name}}.findMany.mockResolvedValueOnce(mock{{NamePlural}});

      // Act
      const response = await request.get('{{basePath}}/{{namePlural}}');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
         // Prisma returns ISO strings for dates, match that format
        mock{{NamePlural}}.map(item => ({...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString()}))
      );
      expect(prismaClient.{{name}}.findMany).toHaveBeenCalledTimes(1);
    });

     it('should handle errors during retrieval', async () => {
      // Arrange
      prismaClient.{{name}}.findMany.mockRejectedValueOnce(new Error('Database error'));

      // Act
      const response = await request.get('{{basePath}}/{{namePlural}}');

      // Assert
      expect(response.status).toBe(500); // Assuming default error handler sets 500
      // Add assertion for error message if your error handler provides one
    });
  });

  // Add more test cases for GET by ID, POST, PUT, DELETE...
  // Example for GET by ID (Not Found)
  describe('GET {{basePath}}/{{namePlural}}/:id', () => {
     it('should return 404 if {{name}} is not found', async () => {
       // Arrange
       prismaClient.{{name}}.findUnique.mockResolvedValueOnce(null); // Simulate not found

       // Act
       const response = await request.get('{{basePath}}/{{namePlural}}/nonexistent-id');

       // Assert
       expect(response.status).toBe(404);
       expect(response.body.error).toBe('{{Name}} not found');
       expect(prismaClient.{{name}}.findUnique).toHaveBeenCalledWith({ where: { id: 'nonexistent-id' }});
     });
  });

});
`,

  prismaModel: `model {{Name}} {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  name      String

  // Add your custom fields here

  @@map("{{namePlural}}")
}
`,

  'healthCheck.ts': `// src/controllers/health.controller.ts
import { Request, Response } from 'express';
// Fixed: Import shared Prisma Client instance
import prisma from '../lib/prisma.js'; // Adjust path if needed
import { logger } from '../utils/logger.js';
import os from 'os';

// Removed: const prisma = new PrismaClient();

/**
 * Health check controller for Cloud Run
 * Performs database connectivity check and returns system info
 */
export async function healthCheck(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const status = { status: 'ok', checks: {} as Record<string, any> };
  let isHealthy = true;

  // Check database connection using the shared client
  try {
    await prisma.$queryRaw\`SELECT 1\`;
    status.checks.database = { status: 'ok', responseTime: \`\${Date.now() - startTime}ms\` };
  } catch (error) {
    isHealthy = false;
    status.checks.database = {
      status: 'error',
      message: 'Database connection failed',
      responseTime: \`\${Date.now() - startTime}ms\`
    };
    logger.error({ error }, 'Health check database error');
  }
  // Fixed: Removed unnecessary $disconnect call from here. Let the client manage pools.
  // finally { await prisma.$disconnect(); }

  // System information
  status.checks.system = {
    uptime: process.uptime(),
    memory: {
      total: Math.round(os.totalmem() / 1024 / 1024), // MB
      free: Math.round(os.freemem() / 1024 / 1024), // MB
      usage: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100, // MB (Resident Set Size)
    },
    cpu: os.loadavg(), // [1, 5, 15] minute load averages
  };

  // Environment information
  status.checks.env = {
    node: process.version,
    environment: process.env.NODE_ENV || 'development',
  };

  // Update overall status
  if (!isHealthy) {
    status.status = 'error';
    res.status(503); // Use 503 Service Unavailable for failed health checks
  }

  res.json(status);
}

// Liveness probe: Checks if the container process is running
export function livenessCheck(req: Request, res: Response): void {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}

// Readiness probe: Checks if the container is ready to serve traffic (e.g., DB connected)
export async function readinessCheck(req: Request, res: Response): Promise<void> {
  try {
    // A quick check against the database using the shared client
    await prisma.$queryRaw\`SELECT 1\`;
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error({ error }, 'Readiness check database error');
    res.status(503).json({ status: 'not_ready', reason: 'Database connection failed' });
  }
  // Fixed: Removed unnecessary $disconnect call
  // finally { await prisma.$disconnect(); }
}
`,

  'healthRoute.ts': `// src/routes/health.routes.ts
import { Router } from 'express';
import { healthCheck, livenessCheck, readinessCheck } from '../controllers/health.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 * name: Health
 * description: Application health checks (including Cloud Run probes)
 */

/**
 * @swagger
 * /health:
 * get:
 * summary: Detailed health check including DB connection and system info
 * tags: [Health]
 * responses:
 * 200:
 * description: System is healthy
 * 503:
 * description: System is unhealthy (e.g., DB connection failed)
 */
router.get('/health', healthCheck);

/**
 * @swagger
 * /liveness:
 * get:
 * summary: Liveness probe (checks if the container process is running)
 * tags: [Health]
 * responses:
 * 200:
 * description: Process is live
 */
router.get('/liveness', livenessCheck);

/**
 * @swagger
 * /readiness:
 * get:
 * summary: Readiness probe (checks if the container is ready to serve traffic, including DB check)
 * tags: [Health]
 * responses:
 * 200:
 * description: Container is ready
 * 503:
 * description: Container is not ready (e.g., DB connection failed)
 */
router.get('/readiness', readinessCheck);

export default router;
`,
};

// Helper Functions
async function loadTemplate(templateName: string): Promise<string> {
  const customTemplatePath = path.join(
    templatesDir,
    `${templateName}.template`,
  );
  try {
    await fs.access(customTemplatePath);
    const content = await fs.readFile(customTemplatePath, 'utf8');
    console.log(chalk.blue(`Using custom template: ${templateName}`));
    return content;
  } catch {
    return defaultTemplates[templateName] || '';
  }
}

function processTemplate(
  templateContent: string,
  variables: GenerateOptions,
): string {
  let result = templateContent;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

interface GenerateOptions {
  name: string;
  Name: string;
  namePlural: string;
  NamePlural: string;
  basePath: string;
}

async function generateFile(
  moduleType: string,
  variables: GenerateOptions,
  skipConfirmation: boolean = false,
): Promise<string | null> {
  const spinner = ora(`Generating ${moduleType}...`).start();

  try {
    const templateContent = await loadTemplate(moduleType);
    if (!templateContent) {
      spinner.warn(`No template found for "${moduleType}", skipping...`);
      return null;
    }

    const content = processTemplate(templateContent, variables);
    let filePath = '';
    let dir = '';

    // Determine file path based on module type
    switch (moduleType) {
      case 'controller.ts':
        dir = path.join(srcDir, 'controllers');
        filePath = path.join(dir, `${variables.name}.controller.ts`);
        break;
      case 'route.ts':
        dir = path.join(srcDir, 'routes');
        filePath = path.join(dir, `${variables.name}.routes.ts`);
        break;
      case 'service.ts':
        dir = path.join(srcDir, 'services');
        filePath = path.join(dir, `${variables.name}.service.ts`);
        break;
      case 'test.ts':
        dir = path.join(srcDir, 'tests'); // Adjusted path based on user's likely structure
        filePath = path.join(dir, `${variables.name}.test.ts`);
        break;
      case 'healthCheck.ts':
        dir = path.join(srcDir, 'controllers');
        filePath = path.join(dir, 'health.controller.ts');
        break;
      case 'healthRoute.ts':
        dir = path.join(srcDir, 'routes');
        filePath = path.join(dir, 'health.routes.ts');
        break;
      case 'prismaModel':
        // Handled separately
        await updatePrismaSchema(content, variables, spinner);
        return null;
      default:
        spinner.warn(`Unknown module type "${moduleType}", skipping...`);
        return null;
    }

    await ensureDirectoryExists(dir);

    const fileAlreadyExists = await fileExists(filePath);
    if (fileAlreadyExists) {
      if (skipConfirmation) {
        spinner.info(
          `File ${path.relative(rootDir, filePath)} already exists, skipping...`,
        );
        return null;
      }

      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `File ${path.relative(rootDir, filePath)} exists. Overwrite?`,
          default: false,
        },
      ]);

      if (!overwrite) {
        spinner.info(`Skipped ${path.relative(rootDir, filePath)}`);
        return null;
      }
    }

    await fs.writeFile(filePath, content, 'utf8');
    spinner.succeed(
      `Generated ${chalk.green(path.relative(rootDir, filePath))}`,
    );
    return filePath;
  } catch (error: any) {
    spinner.fail(`Failed to generate ${moduleType}: ${error.message}`);
    return null;
  }
}

async function updatePrismaSchema(
  modelContent: string,
  variables: GenerateOptions,
  spinner: Ora,
): Promise<void> {
  spinner.text = 'Updating Prisma schema...';
  const schemaPath = path.join(rootDir, 'prisma/schema.prisma');

  try {
    const schemaExists = await fileExists(schemaPath);
    if (!schemaExists) {
      spinner.warn(
        'Prisma schema not found. Please run `npx prisma init` first.',
      );
      spinner.info('Model definition to add manually:');
      console.log(chalk.cyan(modelContent));
      return;
    }

    let schemaContent = await fs.readFile(schemaPath, 'utf8');

    if (
      schemaContent.includes(`model ${variables.Name} {`) ||
      schemaContent.includes(`model ${variables.NamePlural} {`)
    ) {
      spinner.info(
        `Prisma model ${variables.Name} or ${variables.NamePlural} already exists in schema`,
      );
      return;
    }

    // Append model definition neatly before the end or after last model
    schemaContent = schemaContent.trimEnd() + `\n\n${modelContent.trim()}\n`;
    await fs.writeFile(schemaPath, schemaContent, 'utf8');
    spinner.succeed(
      `Updated Prisma schema with ${chalk.cyan(variables.Name)} model`,
    );
  } catch (err: any) {
    spinner.fail(`Error updating Prisma schema: ${err.message}`);
    spinner.info('Add this model manually to prisma/schema.prisma:');
    console.log(chalk.cyan(modelContent));
  }
}

async function updateRoutesIndex(
  name: string,
  basePath: string = '/api/v1',
  isHealthRoute: boolean = false,
): Promise<void> {
  const spinner = ora('Updating routes index...').start();
  const indexPath = path.join(srcDir, 'routes/index.ts');
  const importName = isHealthRoute ? 'healthRoutes' : `${name}Routes`;
  const importPath = isHealthRoute
    ? './health.routes.js'
    : `./${name}.routes.js`; // Ensure .js extension for ESM

  try {
    let content = '';
    const indexExists = await fileExists(indexPath);

    if (!indexExists) {
      // Create a basic routes index if it doesn't exist
      spinner.text = `Creating routes index file: ${indexPath}`;
      await ensureDirectoryExists(path.dirname(indexPath));
      content = `// src/routes/index.ts
import { Router } from 'express';
import ${importName} from '${importPath}';

const router = Router();

// Mount routes
router.use('${isHealthRoute ? '/' : basePath}', ${importName}); // Use provided base path or root for health

export default router;
`;
    } else {
      content = await fs.readFile(indexPath, 'utf8');

      // Check if already imported/used
      if (
        content.includes(`import ${importName}`) ||
        content.includes(`'${importPath}'`)
      ) {
        spinner.info(
          `Route for '${importName}' seems to already exist in routes index.`,
        );
        return;
      }

      // Insert import statement
      const importStatement = `import ${importName} from '${importPath}';\n`;
      const lastImportIndex = content.lastIndexOf('import');
      if (lastImportIndex >= 0) {
        const importEndIndex = content.indexOf('\n', lastImportIndex) + 1;
        content =
          content.slice(0, importEndIndex) +
          importStatement +
          content.slice(importEndIndex);
      } else {
        // No imports? Add at the top after potential initial comments/directives
        content =
          `import { Router } from 'express';\n${importStatement}` + content;
      }

      // Insert router.use statement before export default
      const exportDefaultMatch = /export\s+default\s+router\s*;/;
      const exportIndex = content.search(exportDefaultMatch);
      if (exportIndex >= 0) {
        const routerUseStatement = `router.use('${isHealthRoute ? '/' : basePath}', ${importName});\n`;
        content =
          content.slice(0, exportIndex) +
          routerUseStatement +
          content.slice(exportIndex);
      } else {
        // If export default not found, append (less ideal)
        spinner.warn(
          "Could not find 'export default router;'. Appending router.use at the end.",
        );
        content += `\nrouter.use('${isHealthRoute ? '/' : basePath}', ${importName});\n`;
      }
    }

    await fs.writeFile(indexPath, content, 'utf8');
    spinner.succeed(`Updated routes index with ${chalk.cyan(importName)}`);
  } catch (error: any) {
    spinner.fail(`Failed to update routes index: ${error.message}`);
    spinner.info(
      chalk.yellow('Manual update required for src/routes/index.ts:'),
    );
    console.log(chalk.cyan(`  import ${importName} from '${importPath}';`));
    console.log(
      chalk.cyan(
        `  router.use('${isHealthRoute ? '/' : basePath}', ${importName});`,
      ),
    );
  }
}

// Main Generator Function
async function generate(): Promise<void> {
  console.log(chalk.blue.bold('\n🚀 Module Generator for Cloud Run v2\n'));

  try {
    let name: string,
      namePlural: string,
      moduleTypes: string[],
      addCloudRun: boolean,
      basePath: string;

    // Prioritize CLI options if --yes is provided, otherwise prompt
    if (options.yes && options.name) {
      console.log(
        chalk.yellow('Running in non-interactive mode based on CLI flags...'),
      );
      name = options.name;
      namePlural = options.plural || `${options.name}s`;
      if (options.all) {
        moduleTypes = [
          'controller.ts',
          'route.ts',
          'service.ts',
          'test.ts',
          'prismaModel',
        ];
      } else if (options.types) {
        // Validate and map types
        moduleTypes = options.types
          .split(',')
          .map((t: string) =>
            t.trim().endsWith('.ts') ? t.trim() : `${t.trim()}.ts`,
          )
          .filter(
            (t: string) =>
              defaultTemplates.hasOwnProperty(t) || t === 'prismaModel',
          );
      } else {
        // Default types if none specified in non-interactive mode
        moduleTypes = ['controller.ts', 'route.ts', 'service.ts'];
      }
      addCloudRun = options.cloudRun !== false; // Default true unless explicitly false
      basePath = options.basePath || '/api/v1'; // Use default if not provided

      // Validate required non-interactive flags
      if (!moduleTypes || moduleTypes.length === 0) {
        throw new Error(
          'No valid module types specified with --types or --all.',
        );
      }
    } else {
      // Interactive mode using inquirer
      interface Answers {
        name: string;
        namePlural: string;
        basePath: string;
        moduleTypes: string[];
        addCloudRun: boolean;
      }

      const answers = await inquirer.prompt<Answers>([
        {
          type: 'input',
          name: 'name',
          message: 'Module name (singular, camelCase, e.g., "userProfile"):',
          default: options.name,
          filter: (input: string) => input.trim(),
          validate: (input: string) => {
            if (!input) return 'Module name cannot be empty';
            if (!/^[a-z][a-zA-Z0-9]*$/.test(input)) {
              return 'Module name must start with a lowercase letter and contain only alphanumeric characters (camelCase recommended)';
            }
            return true;
          },
        },
        {
          type: 'input',
          name: 'namePlural',
          message: 'Plural form (e.g., "userProfiles"):',
          default: (ans: { name: string }) => `${ans.name}s`,
          filter: (input: string) => input.trim(),
        },
        {
          type: 'input',
          name: 'basePath',
          message: 'API base path for these routes:',
          default: options.basePath || '/api/v1',
        },
        {
          type: 'checkbox',
          name: 'moduleTypes',
          message: 'Select components to generate:',
          choices: [
            {
              name: 'Controller (API handling)',
              value: 'controller.ts',
              checked: true,
            },
            { name: 'Route (Endpoints)', value: 'route.ts', checked: true },
            {
              name: 'Service (Logic & DB)',
              value: 'service.ts',
              checked: true,
            },
            { name: 'Test (Vitest spec)', value: 'test.ts', checked: false },
            {
              name: 'Prisma Model (DB schema snippet)',
              value: 'prismaModel',
              checked: true,
            },
          ],
          validate: (choices: string[]) =>
            choices.length > 0 || 'Select at least one component',
        },
        {
          type: 'confirm',
          name: 'addCloudRun',
          message: 'Add/Update Cloud Run specific health checks?',
          default: options.cloudRun !== false,
        },
      ] as import('inquirer').DistinctQuestion<Answers>[]);

      name = answers.name;
      namePlural = answers.namePlural;
      moduleTypes = answers.moduleTypes;
      addCloudRun = answers.addCloudRun;
      basePath = answers.basePath;
    }

    // Generate capitalized variations
    const Name = name.charAt(0).toUpperCase() + name.slice(1); // PascalCase for Class names
    const NamePlural = namePlural.charAt(0).toUpperCase() + namePlural.slice(1);

    // Build variables object
    const variables: GenerateOptions = {
      name,
      Name,
      namePlural,
      NamePlural,
      basePath,
    };

    // Generate Cloud Run health check if requested and doesn't exist
    if (addCloudRun) {
      const healthControllerPath = path.join(
        srcDir,
        'controllers/health.controller.ts',
      );
      const healthRoutePath = path.join(srcDir, 'routes/health.routes.ts');
      const healthControllerExists = await fileExists(healthControllerPath);
      const healthRouteExists = await fileExists(healthRoutePath);

      if (!healthControllerExists || !healthRouteExists) {
        console.log(
          chalk.blue('\nGenerating Cloud Run health check components...'),
        );
        await generateFile('healthCheck.ts', variables, options.yes);
        await generateFile('healthRoute.ts', variables, options.yes);
        await updateRoutesIndex('health', '/', true); // Health checks usually at root
      } else {
        console.log(
          chalk.yellow(
            'Health check files already seem to exist, skipping generation.',
          ),
        );
      }
    }

    console.log(
      chalk.blue(
        `\nGenerating module '${name}' with components: ${moduleTypes.join(', ')}`,
      ),
    );

    // Generate the requested module files
    const generatedFiles: string[] = [];
    for (const type of moduleTypes) {
      const generatedPath = await generateFile(type, variables, options.yes);
      if (generatedPath) {
        generatedFiles.push(generatedPath);
      }
    }

    // Update routes index if route was generated
    if (
      moduleTypes.includes('route.ts') &&
      generatedFiles.some((p) => p.endsWith('.routes.ts'))
    ) {
      await updateRoutesIndex(name, basePath);
    }

    // Display next steps
    console.log(chalk.green.bold('\n🎉 Module generation completed!'));
    console.log(chalk.blue('\nNext steps:'));

    if (moduleTypes.includes('prismaModel')) {
      console.log(chalk.yellow('1. Verify Prisma Schema:'));
      console.log(
        `   Check ${chalk.cyan('prisma/schema.prisma')} for the new ${chalk.bold(Name)} model.`,
      );
      console.log(chalk.yellow('2. Update Prisma client:'));
      console.log(`   ${chalk.cyan('npx prisma generate')}`);
      console.log(chalk.yellow('3. Create & Apply Database Migration:'));
      console.log(
        `   ${chalk.cyan(`npx prisma migrate dev --name add_${name}`)}`,
      );
    }

    const stepStart = moduleTypes.includes('prismaModel') ? 4 : 1;
    console.log(chalk.yellow(`${stepStart}. Implement Service Logic:`));
    console.log(
      `   Edit ${chalk.cyan(`src/services/${name}.service.ts`)} to add database interactions.`,
    );
    console.log(chalk.yellow(`${stepStart + 1}. Implement Controller Logic:`));
    console.log(
      `   Edit ${chalk.cyan(`src/controllers/${name}.controller.ts`)} (validation, use service).`,
    );
    if (moduleTypes.includes('test.ts')) {
      console.log(chalk.yellow(`${stepStart + 2}. Write Tests:`));
      console.log(
        `   Edit ${chalk.cyan(`src/tests/${name}.test.ts`)} and run ${chalk.cyan('npm run test')}.`,
      );
    }
    console.log(
      chalk.yellow(
        `${stepStart + (moduleTypes.includes('test.ts') ? 3 : 2)}. Start your development server:`,
      ),
    );
    console.log(`   ${chalk.cyan('npm run dev')}`);

    console.log(chalk.yellow(`\nTest your new endpoints (example):`));
    console.log(`   ${chalk.cyan(`GET ${basePath}/${namePlural}`)}`);
    console.log(`   ${chalk.cyan(`POST ${basePath}/${namePlural}`)}`);
  } catch (err: any) {
    // Handle known errors like user interruption
    if (err.message.includes('User force closed the prompt')) {
      console.log(chalk.red('\n✖ Operation cancelled by user.'));
    } else {
      console.error(chalk.red(`\n❌ Error during generation: ${err.message}`));
      if (err.stack && process.env.DEBUG) {
        // Show stack only in debug mode
        console.error(chalk.gray(err.stack));
      }
    }
    process.exit(1);
  }
}

// Check if templates directory exists, create if not
async function ensureTemplatesDirectory(): Promise<void> {
  try {
    await fs.access(templatesDir);
  } catch {
    try {
      await fs.mkdir(templatesDir, { recursive: true });
      console.log(chalk.blue(`Created templates directory at ${templatesDir}`));
      console.log(
        chalk.yellow(
          'You can add custom *.ts.template files here to override defaults.',
        ),
      );
    } catch (mkdirErr: any) {
      console.warn(
        chalk.yellow(
          `Could not create templates directory: ${mkdirErr.message}`,
        ),
      );
    }
  }
}

// --- Run ---
// Ensure templates dir exists before starting generation logic
ensureTemplatesDirectory().then(generate);
