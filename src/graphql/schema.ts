import { gql } from 'mercurius-codegen';

export const typeDefs = gql`
  scalar DateTime
  scalar Decimal

  enum UserStatus {
    active
    invited
    disabled
  }

  enum InstitutionStatus {
    active
    trial
    suspended
  }

  enum TokenType {
    one_time_login
    refresh
  }

  type User {
    id: ID!
    email: String!
    firstName: String
    lastName: String
    avatarUrl: String
    status: UserStatus!
    emailVerified: Boolean!
    institution: Institution
    roles: [Role!]!
    createdAt: DateTime!
  }

  type Institution {
    id: Int!
    name: String!
    code: String!
    contactEmail: String!
    status: InstitutionStatus!
    plan: Plan
    users: [User!]!
    createdAt: DateTime!
  }

  type Role {
    id: Int!
    name: String!
    description: String
    isSystemRole: Boolean!
    parent: Role
    children: [Role!]!
  }

  type Plan {
    id: Int!
    code: String!
    name: String!
    priceMonthly: Decimal
    priceYearly: Decimal
    maxStudents: Int
  }

  type Query {
    users: [User!]!
    user(id: ID!): User
    institutions: [Institution!]!
    institution(id: Int!): Institution
  }

  type Mutation {
    createInstitution(name: String!, code: String!, contactEmail: String!): Institution!

    createUser(email: String!, firstName: String, lastName: String, institutionId: Int): User!
  }
`;
