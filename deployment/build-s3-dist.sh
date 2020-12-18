#!/bin/bash
#
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned
#
# This script should be run from the repo's deployment directory
# cd deployment
# ./build-s3-dist.sh source-bucket-base-name trademarked-solution-name version-code
#
# Arguments:
#  - source-bucket-base-name: Name for the S3 bucket location where the template will source the Lambda
#    code from. The template will append '-[region_name]' to this bucket name.
#    For example: ./build-s3-dist.sh solutions my-solution v1.0.0
#    The template will then expect the source code to be located in the solutions-[region_name] bucket
#  
#  - template-bucket: where templates will be hosted for the solution
#
#  - trademarked-solution-name: name of the solution for consistency
#
#  - version-code: version of the package

# Check to see if input has been provided:
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ]; then
    echo "Please provide the base source bucket name, trademark approved solution name and version where the lambda code will eventually reside."
    echo "For example: ./build-s3-dist.sh solutions solutions-reference trademarked-solution-name v1.0.0"
    exit 1
fi

# Get reference for all important folders
template_dir="$PWD"
staging_dist_dir="$template_dir/staging"
template_dist_dir="$template_dir/global-s3-assets"
build_dist_dir="$template_dir/regional-s3-assets"
resource_dir="$template_dir/../source/resources"
source_dir="$template_dir/../source/services"

echo "------------------------------------------------------------------------------"
echo "[Init] Remove any old dist files from previous runs"
echo "------------------------------------------------------------------------------"
echo "rm -rf $template_dist_dir"
rm -rf $template_dist_dir
echo "mkdir -p $template_dist_dir"
mkdir -p $template_dist_dir
echo "rm -rf $build_dist_dir"
rm -rf $build_dist_dir
echo "mkdir -p $build_dist_dir"
mkdir -p $build_dist_dir
echo "rm -rf $staging_dist_dir"
rm -rf $staging_dist_dir
echo "mkdir -p $staging_dist_dir"
mkdir -p $staging_dist_dir

echo "------------------------------------------------------------------------------"
echo "[Build] Build typescript microservices"
echo "------------------------------------------------------------------------------"
# build helper function
echo "cd $source_dir/helper"
cd $source_dir/helper
echo "npm run build:all"
npm run build:all

# build pre-req-manager function
echo "cd $source_dir/transformer"
cd $source_dir/transformer
echo "npm run build:all"
npm run build:all

echo "------------------------------------------------------------------------------"
echo "[Init] Install dependencies for the cdk-solution-helper"
echo "------------------------------------------------------------------------------"
echo "cd $template_dir/cdk-solution-helper"
cd $template_dir/cdk-solution-helper
echo "npm install"
npm install

echo "------------------------------------------------------------------------------"
echo "[Synth] CDK Project"
echo "------------------------------------------------------------------------------"
# Install the global aws-cdk package
echo "cd $resource_dir"
cd $resource_dir
echo "npm i"
npm i 

# Run 'cdk synth' to generate raw solution outputs
echo "cdk synth CL-PrimaryStack --output=$staging_dist_dir"
./node_modules/aws-cdk/bin/cdk synth CL-PrimaryStack --output=$staging_dist_dir

# Remove unnecessary output files
echo "cd $staging_dist_dir"
cd $staging_dist_dir
echo "rm tree.json manifest.json cdk.out"
rm tree.json manifest.json cdk.out

echo "------------------------------------------------------------------------------"
echo "[Packing] Templates"
echo "------------------------------------------------------------------------------"
# Move outputs from staging to template_dist_dir
echo "Move outputs from staging to template_dist_dir"
echo "cp $staging_dist_dir/CL*.template.json $template_dist_dir/"
cp $staging_dist_dir/CL*.template.json $template_dist_dir/
rm *.template.json 

# Rename all *.template.json files to *.template
echo "Rename all *.template.json to *.template"
echo "copy templates and rename"
for f in $template_dist_dir/*.template.json; 
do 
  if [[ $f == *"CL-PrimaryStack"* ]]
  then 
    mv "$f" "$template_dist_dir/aws-centralized-logging.template"
  else 
    mv "$f" "$template_dist_dir/aws-centralized-logging-demo.template"
  fi
done

# Run the helper to clean-up the templates and remove unnecessary CDK elements
echo "Run the helper to clean-up the templates and remove unnecessary CDK elements"
echo "node $template_dir/cdk-solution-helper/index"
node $template_dir/cdk-solution-helper/index
if [ "$?" = "1" ]; then
	echo "(cdk-solution-helper) ERROR: there is likely output above." 1>&2
	exit 1
fi

# Find and replace bucket_name, solution_name, and version
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Mac OS
    echo "Updating variables in template with $1"
    replace="s/%%BUCKET_NAME%%/$1/g"
    echo "sed -i '' -e $replace $template_dist_dir/*.template"
    sed -i '' -e $replace $template_dist_dir/*.template
    replace="s/%%TEMPLATE_BUCKET%%/$2/g"
    echo "sed -i '' -e $replace $template_dist_dir/*.template"
    sed -i '' -e $replace $template_dist_dir/*.template
    replace="s/%%SOLUTION_NAME%%/$3/g"
    echo "sed -i '' -e $replace $template_dist_dir/*.template"
    sed -i '' -e $replace $template_dist_dir/*.template
    replace="s/%%VERSION%%/$4/g"
    echo "sed -i '' -e $replace $template_dist_dir/*.template"
    sed -i '' -e $replace $template_dist_dir/*.template
else
    # Other linux
    echo "Updating variables in template with $1"
    replace="s/%%BUCKET_NAME%%/$1/g"
    echo "sed -i -e $replace $template_dist_dir/*.template"
    sed -i -e $replace $template_dist_dir/*.template
    replace="s/%%TEMPLATE_BUCKET%%/$2/g"
    echo "sed -i -e $replace $template_dist_dir/*.template"
    sed -i -e $replace $template_dist_dir/*.template
    replace="s/%%SOLUTION_NAME%%/$3/g"
    echo "sed -i -e $replace $template_dist_dir/*.template"
    sed -i -e $replace $template_dist_dir/*.template
    replace="s/%%VERSION%%/$4/g"
    echo "sed -i -e $replace $template_dist_dir/*.template"
    sed -i -e $replace $template_dist_dir/*.template
fi

echo "------------------------------------------------------------------------------"
echo "[Packing] Sample Dashboard"
echo "------------------------------------------------------------------------------"
echo "cp $template_dir/dashboard.ndjson $template_dist_dir/"
cp $template_dir/dashboard.ndjson $template_dist_dir/

echo "------------------------------------------------------------------------------"
echo "[Packing] Lambdas"
echo "------------------------------------------------------------------------------"
# General cleanup of node_modules and package-lock.json files
echo "find $staging_dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null"
find $staging_dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null
echo "find $staging_dist_dir -iname "package-lock.json" -type f -exec rm -f "{}" \; 2> /dev/null"
find $staging_dist_dir -iname "package-lock.json" -type f -exec rm -f "{}" \; 2> /dev/null

# ... For each asset.* source code artifact in the temporary /staging folder...
cd $staging_dist_dir
for i in `find . -mindepth 1 -maxdepth 1 -type f \( -iname "*.zip" \) -or -type d`; do

    # Rename the artifact, removing the period for handler compatibility
    pfname="$(basename -- $i)" 
    fname="$(echo $pfname | sed -e 's/\.//')"
    mv $i $fname
    
    if [[ $fname != *".zip" ]]
    then
        # Zip the artifact
        echo "zip -r $fname.zip $fname/*"
        zip -r $fname.zip $fname
    fi

# ... repeat until all source code artifacts are zipped      
done

# Copy the zipped artifact from /staging to /regional-s3-assets
echo "cp -R *.zip $build_dist_dir"
cp -R *.zip $build_dist_dir
    
# Remove the old, unzipped artifact from /staging
echo "rm -rf *.zip"
rm -rf *.zip

echo "------------------------------------------------------------------------------"
echo "[Cleanup] Remove temporary files"
echo "------------------------------------------------------------------------------"
# Delete the temporary /staging folder
echo "rm -rf $staging_dist_dir"
rm -rf $staging_dist_dir
