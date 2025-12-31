import { z } from 'zod';

export const CreateCategoryJsonSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
  },
};

export const UpdateCategoryJsonSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
  },
};


