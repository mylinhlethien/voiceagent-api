# IBM Voicebot insurance advisor project: backend application

This application is the backend application of the [Augmented call center project](https://github.com/My-Linh-Le-Thien/crm-webapp).

---
# Requirements

For development, you will only need Node.js and a node global package, npm, installed in your environment.

### Node
- #### Node installation on Windows

  Just go on [official Node.js website](https://nodejs.org/) and download the installer.
Also, be sure to have `git` available in your PATH, `npm` might need it (You can find git [here](https://git-scm.com/)).

- #### Node installation on Ubuntu

  You can install nodejs and npm easily with apt install, just run the following commands.

      $ sudo apt install nodejs
      $ sudo apt install npm

- #### Other Operating Systems
  You can find more information about the installation on the [official Node.js website](https://nodejs.org/) and the [official NPM website](https://npmjs.org/).

If the installation was successful, you should be able to run the following command.

    $ node --version
    v8.11.3

    $ npm --version
    6.1.0

If you need to update `npm`, you can make it using `npm`! Cool right? After running the following command, just open again the command line and be happy.

    $ npm install npm -g

### OpenSSL
- ### Installation via Homebrew
You need to download OpenSSL to run this app locally.
```
brew install openssl@1.1
```
For more information, please refer to this [documentation](https://formulae.brew.sh/formula/openssl@1.1).

---
## Local installation

    To deploy and run the app locally

    $ git clone https://github.com/My-Linh-Le-Thien/voiceagent-api-demo
    $ cd voiceagent-api

Then, you will need to export environment variables before npm install, in order to use Kafka Event Streams.
    
    $ export CPPFLAGS=-I/usr/local/opt/openssl/include
    $ export LDFLAGS=-L/usr/local/opt/openssl/lib
    $ npm install

### Configure app

Line 23 from index.js file, set the opts.calocation variable according to your programming environment:  
**IBM Cloud/Ubuntu: '/etc/ssl/certs'** <br/>
**Red Hat: '/etc/pki/tls/cert.pem'**,  <br/> 
**macOS: '/usr/local/etc/openssl@1.1/cert.pem'** from openssl installed by brew  <br/>

    $ cp .env.example .env
    
Update .env file with your credentials for each IBM Services (Event Streams, Cloudant, Language Translator, Natural Language Understanding and ODM).

---
## Run app locally

    $ npm start

The application should be running on port 8080.
To try it, you can call your voicebot via your Twilio phone number and the conversation should display in the console.

To run the frontend application/user interface, please refer to the [React-socket application](https://github.com/My-Linh-Le-Thien/react-socket).

---
## IBM Cloud Kubernetes deployment

Follow these instructions to deploy the applications to a Kubernetes cluster.

## Build Docker Image

1. Find your container registry **namespace** by running `ibmcloud cr namespaces`. If you don't have any, create one using `ibmcloud cr namespace-add <name>`

2. Identify your **Container Registry** by running `ibmcloud cr info` (Ex: registry.ng.bluemix.net)

3. Build and tag (`-t`)the docker image by running the command below replacing REGISTRY and NAMESPACE with he appropriate values.

   ```sh
   docker build -t <REGISTRY>/<NAMESPACE>/voiceagent-api:latest .
   ```
   Example: `docker build -t registry.ng.bluemix.net/mynamespace/voiceagent-api:latest .`

4. Push the docker image to your Container Registry on IBM Cloud

   ```sh
   docker push <REGISTRY>/<NAMESPACE>/voiceagent-api:latest
   ```

5. Verify the image is in the container registry

    $ ibmcloud cr image-list

## Deploy to a Kubernetes cluster

#### Create a Kubernetes cluster

1. [Creating a Kubernetes cluster in IBM Cloud](https://console.bluemix.net/docs/containers/container_index.html#clusters).
2. Follow the instructions in the Access tab to set up your `kubectl` cli.

#### Add your credentials and create a Kubernetes secret

In the previous steps, you created several instances for different services on IBM Cloud.
You will need to update the file **credentials.txt** and fill out the values for each credentials:

Then we are going to create a Kubernetes secret based on this file:
    $  kubectl create secret generic voiceagent-credentials --from-file=credentials.txt

Then control that you successfully created your secret
    $  kubectl get secrets

#### Create the deployment

1. Replace `<REGISTRY>` and `<NAMESPACE>` with the appropriate values in `deployment.yaml`
2. Create a deployment:
  ```shell
  kubectl apply -f deployment.yaml
  ```

### Access the application

Verify **STATUS** of pod is `RUNNING`

```shell
kubectl get pods
```

Verify the logs of the application

```shell
kubectl logs <POD-ID>
```

**Standard (Paid) Cluster:**

1. Identify your LoadBalancer Ingress IP using `kubectl get service voiceagent-api-service`
2. Access your application at t `http://<EXTERNAL-IP>:<NODE-PORT>/`

**Free Cluster:**

1. Identify your Worker Public IP using `ibmcloud cs workers YOUR_CLUSTER_NAME`
2. Identify the Node Port using `kubectl describe service voiceagent-api-service`
3. Access your application at `http://<WORKER-PUBLIC-IP>:<NODE-PORT>/`

Copy the address of this application since you will need it for [the frontend application](https://github.com/My-Linh-Le-Thien/react-socket).
