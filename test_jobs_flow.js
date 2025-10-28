const { listJobsForUser } = require("./models/Job");

async function testJobsQuery() {
  console.log("=== Testing Jobs Query ===");
  
  // Test with the known user ID from your DynamoDB
  const testUserIds = [
    "199e84a8-2001-701f-5dfc-82bbb8be40bc", // From your earlier output
    "client1", // username
    "test-user-123" // another possible format
  ];
  
  for (const userId of testUserIds) {
    try {
      console.log(`Querying jobs for user ID: "${userId}"`);
      const jobs = await listJobsForUser(userId);
      console.log(`Found ${jobs.length} jobs for user "${userId}"`);
      
      if (jobs.length > 0) {
        console.log("Sample job:", jobs[0]);
      }
    } catch (error) {
      console.error(`Error querying for user "${userId}":`, error.message);
    }
  }
}

testJobsQuery().catch(console.error);
