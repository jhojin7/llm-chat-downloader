# LLM Chat Downloader

This is a minimal React application for downloading chat logs from various sources.

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/jhojin7/llm-chat-downloader.git
   ```
2. Navigate to the project directory:
   ```bash
   cd llm-chat-downloader
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the application:
   ```bash
   npm start
   ```
5. Access the app in your browser at `http://localhost:3000`.

## Deployment to GCP Cloud Run

### Prerequisites

Before deploying, you need to set up the following:

1. **GCP Account and Project**
   - Create a GCP account at https://cloud.google.com
   - Create a new project or use an existing one
   - Note your project ID

2. **Install Google Cloud SDK**
   ```bash
   # For macOS
   brew install google-cloud-sdk

   # For other OS, visit: https://cloud.google.com/sdk/docs/install
   ```

3. **Authenticate with GCP**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

4. **Enable Required APIs**
   ```bash
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   ```

### Deployment Options

#### Option 1: Deploy using Cloud Build (Recommended)

This method uses the `cloudbuild.yaml` configuration for automated deployment:

```bash
gcloud builds submit --config cloudbuild.yaml
```

The app will be deployed to: `https://llm-chat-downloader-[random-hash]-uc.a.run.app`

#### Option 2: Manual Deployment

1. **Build the Docker image**
   ```bash
   docker build -t gcr.io/YOUR_PROJECT_ID/llm-chat-downloader:latest .
   ```

2. **Push to Google Container Registry**
   ```bash
   docker push gcr.io/YOUR_PROJECT_ID/llm-chat-downloader:latest
   ```

3. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy llm-chat-downloader \
     --image gcr.io/YOUR_PROJECT_ID/llm-chat-downloader:latest \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated \
     --port 8080 \
     --memory 512Mi
   ```

## Continuous Deployment with GitHub Actions

This repository includes a GitHub Actions workflow that automatically deploys to Cloud Run on every push to the `main` branch.

### Setting Up Continuous Deployment

1. **Create a GCP Service Account**
   ```bash
   # Set your project ID
   export PROJECT_ID="your-project-id"

   # Create service account
   gcloud iam service-accounts create github-actions-deployer \
     --display-name "GitHub Actions Deployer"

   # Grant necessary roles
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/run.admin"

   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/storage.admin"

   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountUser"
   ```

2. **Create and Download Service Account Key**
   ```bash
   gcloud iam service-accounts keys create key.json \
     --iam-account=github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com
   ```

3. **Add GitHub Secrets**

   Go to your GitHub repository settings: `Settings` → `Secrets and variables` → `Actions`

   Add the following secrets:

   - **GCP_PROJECT_ID**: Your GCP project ID
   - **GCP_SA_KEY**: The contents of the `key.json` file (paste the entire JSON)

4. **Push to Main Branch**

   Once configured, any push to the `main` branch will automatically:
   - Run linting and tests (via CI workflow)
   - Build the Docker image
   - Push to Google Container Registry
   - Deploy to Cloud Run
   - Display the service URL in the GitHub Actions summary

### Workflow Details

The deployment workflow (`.github/workflows/deploy-cloud-run.yml`) includes:
- Automatic triggering on push to main (after CI passes)
- Docker image build and push to GCR
- Cloud Run deployment with optimized settings
- Deployment summary with service URL

### Configuration

You can customize the deployment by editing `.github/workflows/deploy-cloud-run.yml` or `cloudbuild.yaml`:

- **Region**: Change `REGION` environment variable (default: `us-central1`)
- **Memory**: Adjust `--memory` flag (default: `512Mi`)
- **Authentication**: Remove `--allow-unauthenticated` to require authentication
- **Scaling**: Adjust `--min-instances` and `--max-instances` for auto-scaling

### Updating the Deployment

To update an existing deployment:

```bash
gcloud builds submit --config cloudbuild.yaml
```

This will build a new version and automatically deploy it to Cloud Run.

### Monitoring and Logs

View logs for your Cloud Run service:

```bash
gcloud run services logs read llm-chat-downloader --region us-central1
```

### Costs

Cloud Run pricing is based on:
- Request count
- CPU and memory allocation
- Networking

The free tier includes:
- 2 million requests per month
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds

For more details: https://cloud.google.com/run/pricing