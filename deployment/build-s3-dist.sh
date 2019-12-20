#!/bin/bash 
# 
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned 
# 
# This script should be run from the repo's deployment directory 
# cd deployment 
# ./build-s3-dist.sh source-bucket-base-name trademarked-solution-name version-code 
# 
# Paramenters: 
#  - source-bucket-base-name: Name for the S3 bucket location where the template will source the Lambda 
#    code from. The template will append '-[region_name]' to this bucket name. 
#    For example: ./build-s3-dist.sh solutions my-solution v1.0.0 
#    The template will then expect the source code to be located in the solutions-[region_name] bucket 
# 
#  - trademarked-solution-name: name of the solution for consistency 
# 
#  - version-code: version of the package 
 
# Check to see if input has been provided: 
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then 
    echo "Please provide the base source bucket name, trademark approved solution name and version where the lambda code will eventually reside." 
    echo "For example: ./build-s3-dist.sh solutions trademarked-solution-name v1.0.0" 
    exit 1 
fi 

bucket=$1
tmsn=$2
version=$3

do_cmd () {
	echo "------ EXEC $*"
	$*
}
do_replace() {
	replace="s/$2/$3/g"
	file=$1
	do_cmd sed -i -e $replace $file
}
 
# Get reference for all important folders 
template_dir="$PWD" 
template_dist_dir="$template_dir/global-s3-assets" 
build_dist_dir="$template_dir/regional-s3-assets" 
source_dir="$template_dir/../source" 
 
echo "------------------------------------------------------------------------------" 
echo "[Init] Clean old dist, node_modules and bower_components folders" 
echo "------------------------------------------------------------------------------" 
do_cmd rm -rf $template_dist_dir 
do_cmd mkdir -p $template_dist_dir 
do_cmd rm -rf $build_dist_dir 
do_cmd mkdir -p $build_dist_dir 
 
echo "------------------------------------------------------------------------------" 
echo "[Packing] Templates" 
echo "------------------------------------------------------------------------------" 
for file in $template_dir/*.template
do
	do_cmd cp $file $template_dist_dir/ 
done
do_cmd cp basic-dashboard-63.json $template_dist_dir/

echo "------------------------------------------------------------------------------" 
echo "[Updating Bucket name]"
echo "------------------------------------------------------------------------------" 
for file in $template_dist_dir/*.template
do
  	do_replace $file '%%BUCKET_NAME%%' $bucket
done
 
echo "------------------------------------------------------------------------------" 
echo "[Updating Solution name]"
echo "------------------------------------------------------------------------------" 
for file in $template_dist_dir/*.template
do
	do_replace $file '%%SOLUTION_NAME%%' $tmsn
done

echo "------------------------------------------------------------------------------" 
echo "[Updating version name]"
echo "------------------------------------------------------------------------------" 
for file in $template_dist_dir/*.template
do
	do_replace $file '%%VERSION%%' $version
done

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Indexing Code" 
echo "------------------------------------------------------------------------------"
cd $source_dir/services/indexing
npm install
npm run build
npm run zip
cp dist/clog-indexing-service.zip $build_dist_dir/clog-indexing-service.zip

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Auth code"  
echo "------------------------------------------------------------------------------" 
cd $source_dir/services/auth
npm install
npm run build
npm run zip
cp dist/clog-auth.zip $build_dist_dir/clog-auth.zip
