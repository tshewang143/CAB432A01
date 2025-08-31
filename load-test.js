// load-test.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class LoadTester {
  constructor(baseURL, concurrency = 5, testDuration = 300) {
    this.baseURL = baseURL;
    this.concurrency = concurrency;
    this.testDuration = testDuration * 1000; // Convert to ms
    this.authToken = null;
    this.activeRequests = 0;
    this.completedRequests = 0;
    this.failedRequests = 0;
  }

  async login() {
    try {
      const response = await axios.post(`${this.baseURL}/api/auth/login`, {
        username: 'client1',
        password: 'password'
      });
      this.authToken = response.data.token;
      console.log('Login successful');
    } catch (error) {
      console.error('Login failed:', error.message);
      process.exit(1);
    }
  }

  async createJob() {
    const formData = new FormData();
    
    // Use a reasonably large test video file
    const testVideoPath = './test-video.mp4'; // Should be 50-100MB
    formData.append('video', fs.createReadStream(testVideoPath));
    
    // Use maximum CPU-intensive settings
    formData.append('format', 'mp4');
    formData.append('resolution', '4k');
    formData.append('enableCustomProcessing', 'true');
    formData.append('enableFractalEffects', 'true');

    try {
      const response = await axios.post(`${this.baseURL}/api/v1/jobs`, formData, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          ...formData.getHeaders()
        },
        timeout: 300000 // 5 minute timeout
      });
      
      this.completedRequests++;
      console.log(`Job created successfully. Total completed: ${this.completedRequests}`);
    } catch (error) {
      this.failedRequests++;
      console.error('Job creation failed:', error.message);
    } finally {
      this.activeRequests--;
    }
  }

  async startLoadTest() {
    await this.login();
    
    console.log(`Starting load test with ${this.concurrency} concurrent requests`);
    console.log(`Test duration: ${this.testDuration/1000} seconds`);
    
    const startTime = Date.now();
    const interval = setInterval(() => {
      // Maintain concurrency level
      while (this.activeRequests < this.concurrency) {
        this.activeRequests++;
        this.createJob();
      }
      
      // Check if test duration has elapsed
      if (Date.now() - startTime > this.testDuration) {
        clearInterval(interval);
        this.printResults();
      }
    }, 1000);
  }

  printResults() {
    console.log('\n=== Load Test Results ===');
    console.log(`Duration: ${this.testDuration/1000} seconds`);
    console.log(`Concurrency: ${this.concurrency} requests`);
    console.log(`Completed requests: ${this.completedRequests}`);
    console.log(`Failed requests: ${this.failedRequests}`);
    console.log(`Requests per second: ${(this.completedRequests/(this.testDuration/1000)).toFixed(2)}`);
  }
}

// Usage: node load-test.js <baseURL> <concurrency> <duration>
const baseURL = process.argv[2] || 'http://localhost:3000';
const concurrency = parseInt(process.argv[3]) || 3;
const duration = parseInt(process.argv[4]) || 300; // 5 minutes

const tester = new LoadTester(baseURL, concurrency, duration);
tester.startLoadTest();