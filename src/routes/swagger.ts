import { type SwaggerDefinition } from 'swagger-jsdoc';
import swaggerJSDoc from 'swagger-jsdoc';

import { config } from '@/config/index';

import { version } from '../../package.json' assert { type: 'json' };

const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: `${config.server.applicationName} Service API`,
    version,
    description: 'MiKashBoks API',
    contact: {
      name: 'MiKashBoks',
      email: 'salton@mikashboks.com',
    },
  },
  servers: [
    {
      url: `http://${config.server.host}:${config.server.port}${config.server.apiPrefix}`,
      description: 'Local development server',
    },
    {
      url: `https://${config.server.host}:${config.server.port}${config.server.apiPrefix}`,
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

const swaggerConfig = {
  swaggerDefinition,
  apis: ['./src/routes/*.ts', './src/controllers/*.ts', './src/dtos/*.ts'],
};

// Add Swagger documentation
export default swaggerJSDoc(swaggerConfig);
