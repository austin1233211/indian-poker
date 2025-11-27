#!/bin/bash

# PIR Server Deployment Script
# This script handles the deployment of PIR Server to various environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="pir-server"
DOCKER_IMAGE="pir-server"
DOCKER_TAG="latest"

# Default values
ENVIRONMENT="development"
SKIP_BUILD=false
SKIP_TESTS=false
VERBOSE=false

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    echo "PIR Server Deployment Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENVIRONMENT    Target environment (development|staging|production)"
    echo "  --skip-build                     Skip Docker image build"
    echo "  --skip-tests                     Skip running tests before deployment"
    echo "  -v, --verbose                    Verbose output"
    echo "  -h, --help                       Show this help message"
    echo ""
    echo "Environments:"
    echo "  development   Local development environment"
    echo "  staging       Staging environment for testing"
    echo "  production    Production environment"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if Node.js is installed (for local development)
    if [[ "$ENVIRONMENT" == "development" ]] && ! command -v node &> /dev/null; then
        log_warning "Node.js is not installed. Installing dependencies will be skipped."
    fi
    
    log_success "Dependencies check completed"
}

setup_environment() {
    log_info "Setting up environment: $ENVIRONMENT"
    
    # Create environment file
    local env_file=".env.$ENVIRONMENT"
    
    case $ENVIRONMENT in
        development)
            cat > "$env_file" << EOF
NODE_ENV=development
PORT=3000

# Database Configuration
DB_CLIENT=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pir_server_dev
DB_USER=pir_user
DB_PASSWORD=dev_password
DB_SSL=false

# Security Configuration
ENCRYPTION_SECRET=dev_encryption_secret_key_32_characters_long_for_testing
JWT_SECRET=dev_jwt_secret_key_for_testing_only

# Rate Limiting
PIR_QUERY_LIMIT=1000
PIR_RESPONSE_TIMEOUT=30000
PIR_CACHE_SIZE=1000
PIR_ENABLE_CACHE=true
PIR_ENABLE_LOGGING=true

# Authentication
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15

# Logging
LOG_LEVEL=debug
LOG_DIR=./logs

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Maintenance
MAINTENANCE_MODE=false
EOF
            ;;
        staging)
            cat > "$env_file" << EOF
NODE_ENV=staging
PORT=3000

# Database Configuration
DB_CLIENT=postgres
DB_HOST=postgres-staging
DB_PORT=5432
DB_NAME=pir_server_staging
DB_USER=pir_user
DB_PASSWORD=staging_password
DB_SSL=true

# Security Configuration
ENCRYPTION_SECRET=staging_encryption_secret_key_32_characters_long_production_ready
JWT_SECRET=staging_jwt_secret_key_for_production_use

# Rate Limiting
PIR_QUERY_LIMIT=800
PIR_RESPONSE_TIMEOUT=30000
PIR_CACHE_SIZE=500
PIR_ENABLE_CACHE=true
PIR_ENABLE_LOGGING=true

# Authentication
MAX_LOGIN_ATTEMPTS=3
LOCKOUT_MINUTES=30

# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# CORS
ALLOWED_ORIGINS=https://staging.pirserver.com

# Maintenance
MAINTENANCE_MODE=false
EOF
            ;;
        production)
            cat > "$env_file" << EOF
NODE_ENV=production
PORT=3000

# Database Configuration
DB_CLIENT=postgres
DB_HOST=postgres-prod
DB_PORT=5432
DB_NAME=pir_server_prod
DB_USER=pir_user
DB_PASSWORD=prod_secure_password_123
DB_SSL=true

# Security Configuration
ENCRYPTION_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)

# Rate Limiting
PIR_QUERY_LIMIT=500
PIR_RESPONSE_TIMEOUT=30000
PIR_CACHE_SIZE=200
PIR_ENABLE_CACHE=true
PIR_ENABLE_LOGGING=false

# Authentication
MAX_LOGIN_ATTEMPTS=3
LOCKOUT_MINUTES=60

# Logging
LOG_LEVEL=warn
LOG_DIR=./logs

# CORS
ALLOWED_ORIGINS=https://pirserver.com

# Maintenance
MAINTENANCE_MODE=false
EOF
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            exit 1
            ;;
    esac
    
    log_success "Environment file created: $env_file"
}

run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log_info "Skipping tests as requested"
        return
    fi
    
    log_info "Running tests..."
    
    # Install dependencies if Node.js is available
    if command -v node &> /dev/null; then
        log_info "Installing npm dependencies..."
        npm ci
    fi
    
    # Run tests
    if command -v npm &> /dev/null; then
        npm test
        log_success "Tests completed successfully"
    else
        log_warning "npm not available, skipping tests"
    fi
}

build_docker_image() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        log_info "Skipping Docker build as requested"
        return
    fi
    
    log_info "Building Docker image..."
    
    # Build the Docker image
    docker build -t "$DOCKER_IMAGE:$DOCKER_TAG" .
    
    if [[ $? -eq 0 ]]; then
        log_success "Docker image built successfully: $DOCKER_IMAGE:$DOCKER_TAG"
    else
        log_error "Docker build failed"
        exit 1
    fi
}

deploy_development() {
    log_info "Deploying to development environment..."
    
    # Copy environment file
    cp ".env.$ENVIRONMENT" .env
    
    # Start services
    docker-compose up -d postgres redis
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Run migrations and seeds
    log_info "Running database migrations..."
    docker-compose run --rm pir-server npm run migrate
    docker-compose run --rm pir-server npm run seed
    
    # Start the application
    log_info "Starting PIR Server..."
    docker-compose up -d pir-server
    
    log_success "Development deployment completed"
    log_info "PIR Server is running at http://localhost:3000"
    log_info "Health check: http://localhost:3000/health"
}

deploy_staging() {
    log_info "Deploying to staging environment..."
    
    # Load environment variables
    source ".env.$ENVIRONMENT"
    
    # Build and tag image for staging
    docker build -t "$DOCKER_IMAGE:staging" .
    
    # Deploy to staging (this would be customized for your staging environment)
    # For now, we'll just start the services locally
    cp ".env.$ENVIRONMENT" .env
    docker-compose up -d
    
    log_success "Staging deployment completed"
}

deploy_production() {
    log_info "Deploying to production environment..."
    
    # Load production environment variables
    source ".env.$ENVIRONMENT"
    
    # Build production image
    docker build --build-arg NODE_ENV=production -t "$DOCKER_IMAGE:prod" .
    
    # Tag for production registry (customize this for your setup)
    # docker tag "$DOCKER_IMAGE:prod" "your-registry.com/$DOCKER_IMAGE:prod"
    # docker push "your-registry.com/$DOCKER_IMAGE:prod"
    
    # Deploy to production (this would be customized for your production environment)
    log_warning "Production deployment requires manual configuration"
    log_info "Please customize the production deployment steps for your infrastructure"
    
    log_success "Production build completed"
    log_warning "Production deployment requires manual steps - see documentation"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    
    # Remove environment files (except .env if it exists)
    rm -f ".env.$ENVIRONMENT"
    
    log_success "Cleanup completed"
}

# Main deployment function
main() {
    log_info "Starting PIR Server deployment for environment: $ENVIRONMENT"
    
    parse_args "$@"
    check_dependencies
    setup_environment
    
    case $ENVIRONMENT in
        development)
            run_tests
            build_docker_image
            deploy_development
            ;;
        staging)
            run_tests
            build_docker_image
            deploy_staging
            ;;
        production)
            run_tests
            build_docker_image
            deploy_production
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            exit 1
            ;;
    esac
    
    cleanup
    
    log_success "Deployment completed successfully!"
    
    # Show next steps
    echo ""
    echo "Next steps:"
    echo "1. Check the application logs: docker-compose logs -f pir-server"
    echo "2. Monitor the health endpoint: curl http://localhost:3000/health"
    echo "3. Access the API documentation (if available)"
    echo ""
    echo "Default test credentials:"
    echo "  Admin: admin@pirserver.com / AdminPass123!"
    echo "  Premium: premium@pirserver.com / PremiumPass123!"
    echo "  User: user@pirserver.com / UserPass123!"
}

# Run main function
main "$@"