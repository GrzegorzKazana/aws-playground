# 1. create new bucket
aws s3api create-bucket --bucket ap-task01-files-1 --region eu-central-1 --create-bucket-configuration LocationConstraint=eu-central-1
# 2. list buckets
aws s3api list-buckets
# 3. upload a file
aws s3api put-object --bucket ap-task01-files-1 --body ./01-s3-file-storage/files/file01.txt --key file11.txt
# 4. rename the file
aws s3api copy-object --bucket ap-task01-files-1 --copy-source ap-task01-files-1/file11.txt --key file01.txt
aws s3api delete-object --bucket ap-task01-files-1 --key file11.txt
# 5. create directory
aws s3api put-object --bucket ap-task01-files-1 --key subdir/
# 6. upload two files to directory
aws s3api put-object --bucket ap-task01-files-1 --body ./01-s3-file-storage/files/subdir/file11.foo --key subdir/file11.foo
aws s3api put-object --bucket ap-task01-files-1 --body ./01-s3-file-storage/files/subdir/file12.bar --key subdir/file12.bar
# 7. list contents of the bucket
aws s3api list-objects --bucket ap-task01-files-1
# 8. remove all files from directory
aws s3api delete-objects --bucket ap-task01-files-1 --delete 'Objects=[{Key=subdir/file11.foo},{Key=subdir/file12.bar}]'
# 9. get contents of a file
aws s3api get-object --bucket ap-task01-files-1 --key file01.txt download.txt
# 10. remove remaining files
aws s3api delete-objects --bucket ap-task01-files-1 --delete 'Objects=[{Key=subdir/},{Key=file01.txt}]'
# 11. delete the bucket
aws s3api delete-bucket --bucket ap-task01-files-1

