import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { fileURLToPath } from 'url';
import inquirer, { Answers } from 'inquirer';
import ora from 'ora';

const exec = promisify(execCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Check if a file is likely binary based on its extension
async function isBinary(filePath: string): Promise<boolean> {
  const textExtensions = /\.(ts|js|json|md|yml|yaml|html|css|env|txt|gitignore|npmrc|xml|svg)$/i;
  const commonConfigs = /(\.config\.js|\.eslintrc\.js|commitlint\.config\.js|prettierrc)$/i;
  const dockerfile = /Dockerfile$/i;

  if (textExtensions.test(filePath) || commonConfigs.test(filePath) || dockerfile.test(filePath)) {
    return false;
  }
  // For more precision, you could read the first few bytes to check for nulls, but this suffices for now
  return true;
}

// Process a directory recursively
async function processDirectory(dirPath: string, templateVars: Record<string, string>): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootDir, fullPath);

    // Skip irrelevant directories and the script itself
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === 'dist' ||
      entry.name === 'coverage' ||
      relativePath === 'scripts/init.ts'
    ) {
      console.log(`⏩ Skipping: ${relativePath}`);
      continue;
    }

    if (entry.isDirectory()) {
      await processDirectory(fullPath, templateVars);
    } else if (entry.isFile()) {
      if (!(await isBinary(fullPath))) {
        await processFile(fullPath, templateVars);
      } else {
        console.log(`⏩ Skipping binary file: ${relativePath}`);
      }
    }
  }
}

// Process a single file, replacing template variables
async function processFile(filePath: string, templateVars: Record<string, string>): Promise<void> {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let modified = false;
    for (const [key, value] of Object.entries(templateVars)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      if (regex.test(content)) {
        content = content.replace(regex, value);
        modified = true;
      }
    }
    if (modified) {
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`✅ Updated ${path.relative(rootDir, filePath)}`);
    }
  } catch (err: any) {
    console.error(`❌ Error processing ${path.relative(rootDir, filePath)}: ${err.message}`);
  }
}

// Main initialization function
async function initialize(): Promise<void> {
  console.log('🚀 Initializing project from template...\n');

  try {
    // Prompt user for project details
const answers = await inquirer.prompt<Answers>([
  {
    type: 'input',
    name: 'projectName',
    message: 'Project name:',
    default: path.basename(rootDir),
  },
  {
    type: 'input',
    name: 'projectDescription',
    message: 'Project description:',
  },
  {
    type: 'input',
    name: 'authorName',
    message: 'Author name:',
  },
  {
    type: 'input',
    name: 'authorEmail',
    message: 'Author email:',
  },
  {
    type: 'input',
    name: 'dockerImage',
    message: 'Docker image name:',
    default: (ans: Answers) => `${ans.authorName?.toLowerCase() || 'user'}/${ans.projectName?.toLowerCase() || 'app'}`,
  },
  {
    type: 'input',
    name: 'productionUrl',
    message: 'Production URL:',
    default: 'https://api.example.com',
  },
  {
    type: 'confirm',
    name: 'installDeps',
    message: 'Install dependencies now?',
    default: true,
  },
  {
    type: 'confirm',
    name: 'initGit',
    message: 'Initialize git repository?',
    default: true,
  },
] as import('inquirer').DistinctQuestion<Answers>[]);
    const templateVars = {
      PROJECT_NAME: answers.projectName,
      PROJECT_VERSION: '1.0.0',
      PROJECT_DESCRIPTION: answers.projectDescription,
      AUTHOR_NAME: answers.authorName,
      AUTHOR_EMAIL: answers.authorEmail,
      DOCKER_IMAGE: answers.dockerImage,
      PRODUCTION_URL: answers.productionUrl,
      CURRENT_YEAR: new Date().getFullYear().toString(),
    };

    console.log('\nProcessing template files...');
    await processDirectory(rootDir, templateVars);

    // Remove the script itself
    const selfPath = fileURLToPath(import.meta.url);
    try {
      console.log('\nRemoving initialization script...');
      await fs.unlink(selfPath);
      console.log('✅ Initialization script removed.');
    } catch (rmErr: any) {
      console.warn(`⚠️ Could not remove initialization script (${selfPath}): ${rmErr.message}`);
    }

    // Initialize git repository if requested
    if (answers.initGit) {
      const spinner = ora('Initializing git repository...').start();
      try {
        await exec('git init', { cwd: rootDir });
        await exec('git add .', { cwd: rootDir });
        await exec('git commit -m "Initial commit from template"', { cwd: rootDir });
        spinner.succeed('Git repository initialized and initial commit made.');
      } catch (gitErr: any) {
        spinner.fail(`Git initialization failed: ${gitErr.stderr || gitErr.stdout || gitErr.message}`);
      }
    }

    // Install dependencies if requested
    if (answers.installDeps) {
      const spinner = ora('Installing dependencies...').start();
      try {
        const { stdout } = await exec('npm install', { cwd: rootDir });
        console.log(stdout);
        spinner.succeed('Dependencies installed.');
      } catch (npmErr: any) {
        spinner.fail(`Dependency installation failed: ${npmErr.stderr || npmErr.stdout || npmErr.message}`);
      }
    }

    // Provide tailored instructions
    console.log('\n🎉 Project initialized successfully!');
    console.log(`   cd ${path.basename(rootDir)}`);
    if (!answers.installDeps) {
      console.log('   npm install');
    }
    console.log('   Update .env file');
    console.log('   npm run dev');
  } catch (err: any) {
    console.error('\n❌ An error occurred during initialization:', err);
    process.exit(1);
  }
}

// Run the initialization
initialize();