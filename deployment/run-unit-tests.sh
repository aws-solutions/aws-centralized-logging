#!/bin/bash
#
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned
#
# This script should be run from the repo's deployment directory
# cd deployment
# ./run-unit-tests.sh
#

# Get reference for all important folders
template_dir="$PWD"
resource_dir="$template_dir/../source/resources"
source_dir="$template_dir/../source/services"

echo "------------------------------------------------------------------------------"
echo "[Test] Resources"
echo "------------------------------------------------------------------------------"
cd $resource_dir
npm run test -- -u

echo "------------------------------------------------------------------------------"
echo "[Test] helper"
echo "------------------------------------------------------------------------------"
cd $source_dir/helper
npm run test

echo "------------------------------------------------------------------------------"
echo "[Test] transformer"
echo "------------------------------------------------------------------------------"
cd $source_dir/transformer
npm run test

