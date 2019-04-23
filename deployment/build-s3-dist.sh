if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Please provide the base source bucket name and version (subfolder) where the lambda code will eventually reside."
    echo "For example: ./build-s3-dist.sh solutions v1.0.0"
    exit 1
fi

[ -e dist ] && rm -r dist
echo "== mkdir -p dist"
mkdir -p dist

echo "==cp *.template dist/"
cp *.template dist/

echo "==cp ../source/services/indexing/lib/*.json dist/"
cp ../source/services/indexing/lib/*.json dist/

echo "==Updating template mappings"
replace="s/%%BUCKET_NAME%%/$1/g"
sed -i '' -e $replace dist/*.template

replace="s/%%TEMPLATE_BUCKET%%/$2/g"
sed -i '' -e $replace dist/*.template

replace="s/%%VERSION%%/$3/g"
sed -i '' -e $replace dist/*.template

echo "==Download the AMI ID lookup package from S3"
echo 'wget https://s3.amazonaws.com/cloudformation-examples/lambda/amilookup.zip; mv amilookup.zip dist/clog-ami-lookup.zip'
wget https://s3.amazonaws.com/cloudformation-examples/lambda/amilookup.zip; mv amilookup.zip dist/clog-ami-lookup.zip

echo "==Package indexing code"
cd ../source/services/indexing
npm install
npm run build
npm run zip
cp dist/clog-indexing-service.zip ../../../deployment/dist/clog-indexing-service.zip

echo "==Package auth code"
cd ../../../source/services/auth
npm install
npm run build
npm run zip
cp dist/clog-auth.zip ../../../deployment/dist/clog-auth.zip
