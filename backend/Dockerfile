FROM node:18-alpine

WORKDIR /app

# Install nodemon globally for development
RUN npm install -g nodemon ts-node

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "run", "dev"]
