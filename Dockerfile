# Use the specified Ubuntu base image
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && \
    apt-get install -y nodejs npm ffmpeg sqlite3 && \
    apt-get clean

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source code
COPY . .

# Create directories for uploads and transcoded videos
RUN mkdir -p uploads transcoded database

# Expose the port
EXPOSE 3000

# Command to run the application
CMD ["node", "index.js"]
