# Prisma BaseRepository

A powerful, type-safe repository pattern implementation for Prisma ORM that provides enhanced CRUD operations, soft delete support, transaction handling, and more.

## Features

- 🔄 **Full CRUD Operations**: Complete set of create, read, update, and delete operations
- 🧹 **Soft Delete Support**: Built-in soft delete and restoration functionality
- 🔒 **Transaction Support**: Execute multiple operations atomically
- 🔍 **Fluent Query Builder**: Chainable methods for building complex queries
- 🪝 **Pre/Post Hooks System**: Customize operations with hooks
- 📊 **Performance Monitoring**: Track operation execution time
- 🌐 **Relation Management**: Methods to manage relationships
- ⚡ **Bulk Operations**: Efficient handling of multiple records

## Installation

1. Copy the BaseRepository implementation into your project
2. Make sure you have the required dependencies:

```bash
npm install prisma @prisma/client pino
```

## Basic Setup

First, create a `RepositoryFactory` with your Prisma client:

```typescript
import { PrismaClient } from '@prisma/client';
import { RepositoryFactory } from './path/to/repository';

// Initialize Prisma client
const prisma = new PrismaClient();

// Create repository factory
const repositoryFactory = new RepositoryFactory(prisma);

// Export factory for use throughout your application
export { repositoryFactory };
```

Then, create specific repositories for your models:

```typescript
// userRepository.ts
import { repositoryFactory } from './repository-factory';
import type { 
  User, 
  Prisma 
} from '@prisma/client';

// Create a repository for the User model
const userRepository = repositoryFactory.create<
  User,                                  // Model
  Prisma.UserWhereUniqueInput,           // WhereUnique
  Prisma.UserWhereInput,                 // Where
  Prisma.UserOrderByWithRelationInput,   // OrderBy
  Prisma.UserCreateInput,                // Create
  Prisma.UserUpdateInput,                // Update
  Prisma.UserSelect,                     // Select
  Prisma.UserInclude                     // Include
>('User');

export { userRepository };
```

## Basic Usage Examples

### Create a record

```typescript
// Create a single user
const user = await userRepository.create({
  name: 'John Doe',
  email: 'john@example.com',
  role: 'USER'
});

// Create multiple users
const count = await userRepository.createMany([
  { name: 'Alice', email: 'alice@example.com', role: 'USER' },
  { name: 'Bob', email: 'bob@example.com', role: 'USER' }
]);
```

### Find records

```typescript
// Find by unique identifier
const user = await userRepository.findByUnique({ id: 1 });

// Find with conditions
const activeUsers = await userRepository.findOne({
  active: true,
  role: 'ADMIN'
});

// Find multiple records with pagination
const { data, total, pageInfo } = await userRepository.findAll(
  { role: 'USER' },
  { 
    pagination: { strategy: 'offset', page: 1, pageSize: 10 },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true }
  }
);
```

### Update records

```typescript
// Update a single record
const updatedUser = await userRepository.update(
  { id: 1 },
  { name: 'John Smith', updatedAt: new Date() }
);

// Update multiple records
const updatedCount = await userRepository.updateMany(
  { role: 'USER' },
  { active: true }
);
```

### Delete records

```typescript
// Soft delete (mark as deleted but keep in database)
const deletedUser = await userRepository.softDelete({ id: 1 });

// Hard delete (actually remove from database)
const permanentlyDeletedUser = await userRepository.hardDelete({ id: 2 });

// Restore soft-deleted record
const restoredUser = await userRepository.restore({ id: 1 });
```

## Advanced Usage

### Using the Query Builder

The query builder provides a fluent API for building complex queries:

```typescript
// Find active admins, ordered by creation date, with pagination
const { data: admins, total } = await userRepository.query()
  .where({ role: 'ADMIN' })
  .orderBy({ createdAt: 'desc' })
  .skip(10)
  .take(10)
  .findAll();

// Count users matching criteria
const adminCount = await userRepository.query()
  .where({ role: 'ADMIN' })
  .count();

// Check if any users match criteria
const hasActiveAdmins = await userRepository.query()
  .where({ role: 'ADMIN', active: true })
  .exists();
```

### Working with Relationships

```typescript
// Connect a user to roles (many-to-many)
await userRepository.connectRelations(
  userId,
  'roles',
  [roleId1, roleId2]
);

// Disconnect a user from roles
await userRepository.disconnectRelations(
  userId,
  'roles',
  [roleId1]
);

// Set roles for a user (replaces existing connections)
await userRepository.setRelations(
  userId,
  'roles',
  [roleId3, roleId4]
);
```

### Transaction Support

Execute multiple operations as a single transaction:

```typescript
const result = await userRepository.withTransaction(async (txRepo) => {
  // Create user
  const user = await txRepo.create({
    name: 'Jane Smith',
    email: 'jane@example.com'
  });
  
  // Create profile for user
  const profile = await profileRepository.create({
    userId: user.id,
    bio: 'Software developer'
  });
  
  // Return composite result
  return { user, profile };
});
```

### Using Hooks

Hooks allow you to execute custom logic before or after operations:

```typescript
// Add a pre-hook to hash passwords before user creation
userRepository.registerPreHook('create', async (data) => {
  if (data.password) {
    data.password = await bcrypt.hash(data.password, 10);
  }
  return data;
});

// Add a post-hook to log audit information after updates
userRepository.registerPostHook('update', async (result) => {
  console.log(`User ${result.id} updated at ${new Date().toISOString()}`);
  return result;
});
```

### Bulk Operations

Efficiently handle multiple records at once:

```typescript
// Bulk upsert (create or update)
const { count } = await userRepository.bulkUpsert([
  { email: 'john@example.com', name: 'John Doe', role: 'USER' },
  { email: 'jane@example.com', name: 'Jane Smith', role: 'ADMIN' }
], ['email']);
```

## Complete Example

Here's a complete example of a user service using the repository pattern:

```typescript
// user-service.ts
import { userRepository } from './repositories/user-repository';
import { profileRepository } from './repositories/profile-repository';
import { hashPassword } from './utils/auth';

export class UserService {
  // Register a new user with profile
  async registerUser(userData, profileData) {
    // Hash the password before storing
    const hashedPassword = await hashPassword(userData.password);
    
    return userRepository.withTransaction(async (txUserRepo) => {
      // Create the user in the transaction
      const user = await txUserRepo.create({
        ...userData,
        password: hashedPassword
      });
      
      // Create user profile in the same transaction
      const profile = await profileRepository.create({
        ...profileData,
        userId: user.id
      });
      
      // Return composite result (without password)
      const { password, ...userWithoutPassword } = user;
      return {
        ...userWithoutPassword,
        profile
      };
    });
  }
  
  // Find users with pagination
  async findUsers(filters, page = 1, pageSize = 10) {
    return userRepository.findAll(filters, {
      pagination: { strategy: 'offset', page, pageSize },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        profile: true
      }
    });
  }
  
  // Deactivate user (soft delete)
  async deactivateUser(userId) {
    return userRepository.softDelete({ id: userId });
  }
  
  // Assign roles to user
  async assignRoles(userId, roleIds) {
    return userRepository.connectRelations(userId, 'roles', roleIds);
  }
}
```

## Customizing for Your Project

### Custom Soft Delete Configuration

You can customize the soft delete behavior:

```typescript
const postRepository = repositoryFactory.create<Post, ...>(
  'Post',
  {
    useDeletedFlag: true,   // Use a boolean 'deleted' field
    useDeletedAt: false     // Don't use the 'deletedAt' timestamp field
  }
);
```

### Performance Tracking

Enable detailed performance tracking:

```typescript
const userRepository = repositoryFactory.create<User, ...>(
  'User',
  { useDeletedFlag: true, useDeletedAt: true },
  {
    trackPerformance: true,
    trackAuditing: true,
    slowOperationThreshold: 500  // Mark operations taking > 500ms as slow
  }
);
```

## Best Practices

1. **Use Repositories in Services**: Keep repositories as data access layer and implement business logic in services
2. **Favor Transactions for Multi-Step Operations**: Use transactions when multiple operations need to succeed or fail together
3. **Utilize Query Builder for Complex Queries**: The fluent API makes complex queries more readable
4. **Consider Performance**: Be mindful of N+1 issues by using `include` appropriately
5. **Use Soft Delete**: Prefer soft delete for most use cases to preserve data history

## Troubleshooting

- **Type Errors**: Ensure your Prisma types match the generic parameters in the repository
- **Performance Issues**: Check for missing database indexes or overly complex queries
- **Transaction Errors**: Remember that transactions have limitations in terms of time and number of operations

## License

This code is available for use under the MIT License.