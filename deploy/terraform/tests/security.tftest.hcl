mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["ap-south-1a", "ap-south-1b"] }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:ap-south-1:123456789012:key/11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "aws_db_instance" {
    defaults = { master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:synthetic" }] }
  }
}
variables {
  hospital               = "synthetic"
  environment            = "staging"
  hostname               = "synthetic.example"
  certificate_arn        = "arn:aws:acm:ap-south-1:123456789012:certificate/11111111-1111-1111-1111-111111111111"
  backend_image          = "example.invalid/backend@sha256:0000000000000000000000000000000000000000000000000000000000000000"
  frontend_image         = "example.invalid/frontend@sha256:0000000000000000000000000000000000000000000000000000000000000000"
  operator_principal_arn = "arn:aws:iam::123456789012:role/synthetic-operator"
}
run "private_databases_and_isolated_credentials" {
  command = plan
  assert {
    condition     = alltrue([for db in aws_db_instance.main : !db.publicly_accessible && db.storage_encrypted && db.multi_az && db.backup_retention_period == 35 && db.deletion_protection])
    error_message = "Both clinical and ledger databases must be private, encrypted, redundant and backed up."
  }
  assert {
    condition     = aws_cloudwatch_log_group.app.retention_in_days == 180
    error_message = "Application log retention must be configured explicitly."
  }
  assert {
    condition     = aws_ecs_service.web.desired_count == 0 && aws_ecs_service.worker.desired_count == 0
    error_message = "Do not start production services before operator secrets/schema provisioning."
  }
  assert {
    condition     = aws_iam_role.execution["runtime"].name != aws_iam_role.execution["migration"].name
    error_message = "Runtime must not use the migration execution role."
  }
  assert {
    condition     = alltrue([for subnet in aws_subnet.private : !subnet.map_public_ip_on_launch])
    error_message = "Private tasks and databases must not receive public addresses."
  }
}
