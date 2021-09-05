# 1. create new bucket
aws s3 mb s3://ap-task01-files-2
# 2. list buckets
aws s3 ls
# 3. upload a file
aws s3 cp ./01-s3-file-storage/files/file01.txt s3://ap-task01-files-2
# 4. rename the file
aws s3 mv s3://ap-task01-files-2/file01.txt s3://ap-task01-files-2/file11.txt
# 5. create directory
# 6. upload two files to directory
aws s3 cp ./01-s3-file-storage/files/subdir/file11.foo s3://ap-task01-files-2/subdir/file11.foo
aws s3 cp ./01-s3-file-storage/files/subdir/file12.bar s3://ap-task01-files-2/subdir/file12.bar
# 7. list contents of the bucket
aws s3 ls s3://ap-task01-files-2 --recursive
# 8. remove all files from directory
aws s3 rm s3://ap-task01-files-2/subdir/ --recursive
# 9. get contents of a file
aws s3 cp s3://ap-task01-files-2/file11.txt download.txt
# 10. remove remaining files
aws s3 rm s3://ap-task01-files-2/ --recursive
# 11. delete the bucket
aws s3 rb s3://ap-task01-files-2
