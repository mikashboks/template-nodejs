// src/routes/index.ts
import { Router, type Request, type Response } from 'express';

// Import all route modules
// This will be populated automatically when using the generate script
// The commented imports below are examples - your actual imports will depend on your modules
// import productRoutes from './product.routes.js';
// import userRoutes from './user.routes.js';
// import orderRoutes from './order.routes.js';

const router = Router();

// Root API endpoint - shows available endpoints
router.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'API is running',
    version: process.env['npm_package_version'] || '1.0.0',
    endpoints: [
      // Add your endpoints here - this will be populated by your actual modules
      // { path: '/products', description: 'Product management' },
      // { path: '/users', description: 'User management' },
      // { path: '/orders', description: 'Order management' },
    ],
    documentation: '/api-docs', // If you have Swagger UI set up
  });
});

// Mount all route modules
// This section will be updated automatically by the generate script
// router.use('/products', productRoutes);
// router.use('/users', userRoutes);
// router.use('/orders', orderRoutes);

export default router;
