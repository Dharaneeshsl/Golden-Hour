terraform {

  required_version = ">= 1.10, < 2.0"
  required_providers {

    aws = {
      source = "hashicorp/aws", version = "~> 6.0"
    }


  }


}

provider "aws" {

  region = "ap-south-1"
  default_tags {
    tags = {
      Application = "GoldenHour", Hospital = var.hospital, Environment = var.environment
    }

  }


}

variable "hospital" {

  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,15}$", var.hospital))
    error_message = "Use a non-sensitive hospital deployment slug (3–16 characters)."
  }


}

variable "environment" {

  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Use staging or production with separate state and credentials."
  }


}

variable "hostname" {
  type = string
}

variable "certificate_arn" {
  type = string
}

variable "backend_image" {

  type = string
  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.backend_image))
    error_message = "Use a verified immutable backend image digest."
  }


}

variable "frontend_image" {

  type = string
  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.frontend_image))
    error_message = "Use a verified immutable frontend image digest."
  }


}

variable "desired_count" {

  type    = number
  default = 0
  validation {
    condition     = contains([0, 2, 3, 4], var.desired_count)
    error_message = "Use zero while bootstrapping secrets/schema, then at least two web tasks."
  }


}

variable "operator_principal_arn" {
  type = string
}

variable "secret_kms_key_arns" {
  type    = list(string)
  default = []
}

locals {

  name         = "gh-${var.hospital}-${var.environment}"
  deployment   = "${var.hospital}-${var.environment}"
  secret_names = ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY", "MSG91_AUTH_KEY", "MSG91_FLOW_ID", "ADMIN_USER_IDS", "ERASURE_LEDGER_DATABASE_URL", "DB_CA_PEM"]

}

data "aws_caller_identity" "current" {

}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {

  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {

  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]

}

resource "aws_subnet" "private" {
  map_public_ip_on_launch = false

  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

}

resource "aws_eip" "nat" {
  count  = 2
  domain = "vpc"
}

resource "aws_nat_gateway" "main" {

  count         = 2
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  depends_on    = [aws_internet_gateway.main]

}

resource "aws_route_table" "public" {

  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }


}

resource "aws_route_table_association" "public" {

  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id

}

resource "aws_route_table" "private" {

  count  = 2
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }


}

resource "aws_route_table_association" "private" {

  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id

}

resource "aws_security_group" "alb" {
  name_prefix = "${local.name}-alb-"
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "task" {
  name_prefix = "${local.name}-task-"
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "db" {
  name_prefix = "${local.name}-db-"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.task.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_vpc_security_group_ingress_rule" "task" {
  security_group_id            = aws_security_group.task.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_vpc_security_group_egress_rule" "task_https" {
  security_group_id = aws_security_group.task.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "task_db" {
  security_group_id            = aws_security_group.task.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_ingress_rule" "db" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.task.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_kms_key" "main" {

  for_each                = toset(["storage", "patient"])
  description             = "${local.name} ${each.key} encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30

}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "main" {

  name_prefix = "${local.name}-"
  family      = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }


}

resource "aws_db_instance" "main" {

  for_each                        = toset(["clinical", "ledger"])
  identifier                      = "${local.name}-${each.key}"
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = "db.t4g.small"
  allocated_storage               = 20
  max_allocated_storage           = 100
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.main["storage"].arn
  db_name                         = each.key == "clinical" ? "goldenhour" : "erasure_ledger"
  username                        = "gh_owner"
  manage_master_user_password     = true
  master_user_secret_kms_key_id   = aws_kms_key.main["storage"].arn
  multi_az                        = true
  publicly_accessible             = false
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  parameter_group_name            = aws_db_parameter_group.main.name
  backup_retention_period         = 35
  copy_tags_to_snapshot           = true
  auto_minor_version_upgrade      = true
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.name}-${each.key}-final"
  enabled_cloudwatch_logs_exports = ["upgrade"]

}

resource "aws_secretsmanager_secret" "runtime" {
  name                    = "${local.name}/runtime"
  kms_key_id              = aws_kms_key.main["storage"].arn
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret" "migration" {
  name                    = "${local.name}/migration"
  kms_key_id              = aws_kms_key.main["storage"].arn
  recovery_window_in_days = 30
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/goldenhour/${local.name}"
  retention_in_days = 180
}

resource "aws_ecs_cluster" "main" {

  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }


}

resource "aws_iam_role" "execution" {

  for_each = toset(["runtime", "migration"])
  name     = "${local.name}-${each.key}-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }, Action = "sts:AssumeRole"
      }
    ]
    }
  )

}

resource "aws_iam_role_policy_attachment" "execution" {

  for_each   = aws_iam_role.execution
  role       = each.value.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"

}

resource "aws_iam_role_policy" "secret" {

  for_each = aws_iam_role.execution
  role     = each.value.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = concat([each.key == "runtime" ? aws_secretsmanager_secret.runtime.arn : aws_secretsmanager_secret.migration.arn], compact([var.registry_credentials_secret_arn]))
      }, {
      Effect = "Allow", Action = ["kms:Decrypt"], Resource = concat([aws_kms_key.main["storage"].arn], var.secret_kms_key_arns)
      }
    ]
    }
  )

}

resource "aws_iam_role" "task" {

  name = "${local.name}-application"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }, Action = "sts:AssumeRole"
      }
    ]
    }
  )

}

resource "aws_iam_role_policy" "patient_keys" {

  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Action = ["kms:Encrypt", "kms:Decrypt"], Resource = aws_kms_key.main["patient"].arn, Condition = {
        StringEquals = {
          "kms:EncryptionContext:application" = "GoldenHour", "kms:EncryptionContext:deployment" = local.deployment
        }

      }

      }
    ]
    }
  )

}

resource "aws_iam_role" "operator" {

  name = "${local.name}-key-operator"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        AWS     = var.operator_principal_arn
      }, Action = "sts:AssumeRole"
      }
    ]
    }
  )

}

resource "aws_iam_role_policy" "operator" {

  role = aws_iam_role.operator.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Action = ["kms:ReEncryptFrom", "kms:ReEncryptTo", "kms:DescribeKey"], Resource = aws_kms_key.main["patient"].arn
      }, {
      Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [aws_secretsmanager_secret.migration.arn]
      }, {
      Effect = "Allow", Action = ["kms:Decrypt"], Resource = aws_kms_key.main["storage"].arn
      }
    ]
    }
  )

}

locals {

  common_environment = [for key, value in {
    NODE_ENV = "production", DB_SSL = "true", AWS_REGION = "ap-south-1", AWS_KMS_KEY_ID = aws_kms_key.main["patient"].arn, KMS_DEPLOYMENT_ID = local.deployment, HOSPITAL_NAME = var.hospital, FRONTEND_ORIGIN = "https://${var.hostname}", AUTH_DOMAIN = var.hostname, AUTH_URI = "https://${var.hostname}", TRUST_PROXY = "2", WALLET_AUTH_ENABLED = "false", CLINICAL_ERASURE_ENABLED = "true"
    }
    : {
      name = key, value = value
    }
  ]
  runtime_secrets = [for key in local.secret_names : {
    name = key, valueFrom = "${aws_secretsmanager_secret.runtime.arn}:${key}::"
    }
  ]
  log_options = {
    "awslogs-group" = aws_cloudwatch_log_group.app.name, "awslogs-region" = "ap-south-1", "awslogs-stream-prefix" = "service"
  }


}

resource "aws_ecs_task_definition" "web" {

  family                   = "${local.name}-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.execution["runtime"].arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([for container in [
    {
      name = "backend", image = var.backend_image, essential = true, environment = local.common_environment, secrets = local.runtime_secrets, portMappings = [{
        containerPort = 4000
        }
        ], logConfiguration = {
        logDriver = "awslogs", options = local.log_options
        }, healthCheck = {
        command = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:4000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""], interval = 30, timeout = 5, retries = 3, startPeriod = 60
      }

    },
    {
      name = "frontend", image = var.frontend_image, essential = true, environment = [{
        name = "API_UPSTREAM", value = "127.0.0.1:4000"
        }, {
        name = "TRUSTED_PROXY_CIDRS", value = "10.42.0.0/16"
        }
        ], portMappings = [{
          containerPort = 3000
        }
        ], dependsOn = [{
          containerName = "backend", condition = "HEALTHY"
        }
        ], logConfiguration = {
        logDriver = "awslogs", options = local.log_options
      }

    }

  ] : merge(container, local.registry_auth)])

}

resource "aws_ecs_task_definition" "worker" {

  family                   = "${local.name}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.execution["runtime"].arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([for container in [{
    name = "worker", image = var.backend_image, essential = true, command = ["node", "dist/worker.js"], environment = local.common_environment, secrets = local.runtime_secrets, logConfiguration = {
      logDriver = "awslogs", options = local.log_options
      }, healthCheck = {
      command = ["CMD", "node", "dist/worker-health.js"], interval = 30, timeout = 5, retries = 3, startPeriod = 60
    }

    }
  ] : merge(container, local.registry_auth)])

}

resource "aws_ecs_task_definition" "migration" {

  family                   = "${local.name}-migration"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.execution["migration"].arn
  container_definitions = jsonencode([for container in [{
    name = "migration", image = var.backend_image, essential = true, command = ["node", "dist/migrate.js"], environment = [{
      name = "NODE_ENV", value = "production"
      }, {
      name = "DB_SSL", value = "true"
      }
      ], secrets = [{
        name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.migration.arn}:DATABASE_URL::"
        }, {
        name = "DB_CA_PEM", valueFrom = "${aws_secretsmanager_secret.migration.arn}:DB_CA_PEM::"
      }
      ], logConfiguration = {
      logDriver = "awslogs", options = local.log_options
    }

    }
  ] : merge(container, local.registry_auth)])

}

resource "aws_lb" "main" {
  name                       = local.name
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "main" {

  name                 = local.name
  port                 = 3000
  protocol             = "HTTP"
  vpc_id               = aws_vpc.main.id
  target_type          = "ip"
  deregistration_delay = 30
  health_check {
    path    = "/api/ready"
    matcher = "200"
  }


}

resource "aws_lb_listener" "http" {

  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }

  }


}

resource "aws_lb_listener" "https" {

  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }


}

resource "aws_ecs_service" "web" {

  name                              = "${local.name}-web"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.web.arn
  desired_count                     = var.desired_count
  launch_type                       = "FARGATE"
  platform_version                  = "1.4.0"
  health_check_grace_period_seconds = 90
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = "frontend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.https]

}

resource "aws_ecs_service" "worker" {

  name             = "${local.name}-worker"
  cluster          = aws_ecs_cluster.main.id
  task_definition  = aws_ecs_task_definition.worker.arn
  desired_count    = var.desired_count == 0 ? 0 : 1
  launch_type      = "FARGATE"
  platform_version = "1.4.0"
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false
  }


}

resource "aws_sns_topic" "alerts" {
  name              = "${local.name}-operations"
  kms_master_key_id = aws_kms_key.alerts.arn
}

resource "aws_cloudwatch_metric_alarm" "http_errors" {

  alarm_name  = "${local.name}-http-errors"
  namespace   = "AWS/ApplicationELB"
  metric_name = "HTTPCode_Target_5XX_Count"
  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  period              = 60
  evaluation_periods  = 2
  statistic           = "Sum"
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

}

resource "aws_cloudwatch_metric_alarm" "db_connections" {

  for_each    = aws_db_instance.main
  alarm_name  = "${local.name}-${each.key}-db-connections"
  namespace   = "AWS/RDS"
  metric_name = "DatabaseConnections"
  dimensions = {
    DBInstanceIdentifier = each.value.identifier
  }

  period              = 60
  evaluation_periods  = 2
  statistic           = "Maximum"
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]

}

output "database_endpoints" {
  value = {
    for key, db in aws_db_instance.main : key => db.address
  }

}

output "managed_owner_secret_arns" {
  value = {
    for key, db in aws_db_instance.main : key => db.master_user_secret[0].secret_arn
  }

  sensitive = true
}

output "runtime_secret_arn" {
  value = aws_secretsmanager_secret.runtime.arn
}

output "migration_secret_arn" {
  value = aws_secretsmanager_secret.migration.arn
}

output "patient_kms_key_arn" {
  value = aws_kms_key.main["patient"].arn
}

output "key_operator_role_arn" {
  value = aws_iam_role.operator.arn
}

output "load_balancer_hostname" {
  value = aws_lb.main.dns_name
}

output "cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "migration_task_definition" {
  value = aws_ecs_task_definition.migration.arn
}

output "private_subnets" {
  value = aws_subnet.private[*].id
}

output "task_security_group" {
  value = aws_security_group.task.id
}

output "alert_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

resource "aws_kms_key" "alerts" {
  description             = "${local.name} encrypted operational alerts"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }, Action = "kms:*", Resource = "*" },
      { Effect = "Allow", Principal = { Service = "cloudwatch.amazonaws.com" }, Action = ["kms:Decrypt", "kms:GenerateDataKey*"], Resource = "*", Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }, ArnLike = { "aws:SourceArn" = "arn:aws:cloudwatch:ap-south-1:${data.aws_caller_identity.current.account_id}:alarm:${local.name}-*" } } }
    ]
  })
}
resource "aws_sns_topic_policy" "alerts" {
  arn = aws_sns_topic.alerts.arn
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "cloudwatch.amazonaws.com" }, Action = "sns:Publish", Resource = aws_sns_topic.alerts.arn, Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }, ArnLike = { "aws:SourceArn" = "arn:aws:cloudwatch:ap-south-1:${data.aws_caller_identity.current.account_id}:alarm:${local.name}-*" } } }
  ] })
}
locals {
  operational_metrics = {
    auth_failures    = { pattern = "{ $.event = \"http\" && $.status = 401 }", value = "1", threshold = 20, statistic = "Sum" }
    emergency_access = { pattern = "{ $.event = \"http\" && $.service = \"emergency\" && $.method = \"POST\" && $.route = \"/\" && $.status = 200 }", value = "1", threshold = 20, statistic = "Sum" }
    queue_pending    = { pattern = "{ $.event = \"queue_depth\" }", value = "$.pending", threshold = 100, statistic = "Maximum" }
    queue_failed     = { pattern = "{ $.event = \"queue_depth\" }", value = "$.failed", threshold = 0, statistic = "Maximum" }
  }
}
resource "aws_cloudwatch_log_metric_filter" "operational" {
  for_each       = local.operational_metrics
  name           = "${local.name}-${each.key}"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = each.value.pattern
  metric_transformation {
    name      = each.key
    namespace = "GoldenHour/${local.name}"
    value     = each.value.value
    unit      = "Count"
  }
}
resource "aws_cloudwatch_metric_alarm" "operational" {
  for_each            = local.operational_metrics
  alarm_name          = "${local.name}-${each.key}"
  namespace           = "GoldenHour/${local.name}"
  metric_name         = each.key
  period              = 60
  evaluation_periods  = 2
  statistic           = each.value.statistic
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  actions_enabled     = var.desired_count > 0
  alarm_actions       = [aws_sns_topic.alerts.arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.operational]
}

variable "registry_credentials_secret_arn" {
  type        = string
  default     = null
  description = "Optional Secrets Manager ARN for private non-ECR registry username/password JSON."
}
locals {
  registry_auth = var.registry_credentials_secret_arn == null ? {} : { repositoryCredentials = { credentialsParameter = var.registry_credentials_secret_arn } }
}
