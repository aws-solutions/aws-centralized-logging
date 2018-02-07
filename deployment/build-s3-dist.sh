rm -r dist

mkdir dist

cp *.template dist/
cp ../source/services/indexing/lib/*.json dist/

replace="s/%%BUCKET_NAME%%/$1/g"
sed -i '' -e $replace dist/*.template

replace="s/%%TEMPLATE_BUCKET%%/$2/g"
sed -i '' -e $replace dist/*.template

echo 'Download the AMI ID lookup package from S3'
echo 'wget https://s3.amazonaws.com/cloudformation-examples/lambda/amilookup.zip; mv amilookup.zip dist/clog-ami-lookup.zip'
wget https://s3.amazonaws.com/cloudformation-examples/lambda/amilookup.zip; mv amilookup.zip dist/clog-ami-lookup.zip

cd ../source/services/indexing
npm install
npm run build
npm run zip
cp dist/clog-indexing-service.zip ../../../deployment/dist/clog-indexing-service.zip
