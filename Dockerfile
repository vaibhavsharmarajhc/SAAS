FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package configuration files from the current build context
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy the rest of the application files
COPY . .

# Expose the default SaaS port
EXPOSE 8080

# Define the port environment variable
ENV PORT=8080

# Launch the server
CMD ["node", "server.js"]
