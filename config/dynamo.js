// config/dynamo.js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const DDB_TABLE = process.env.DDB_TABLE;

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
export const ddbDoc = DynamoDBDocumentClient.from(ddb);
