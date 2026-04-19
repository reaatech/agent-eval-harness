output "secret_arn" {
  description = "ARN of the secret"
  value       = aws_secretsmanager_secret.main.arn
}

output "secret_name" {
  description = "Name of the secret"
  value       = aws_secretsmanager_secret.main.name
}

output "secret_id" {
  description = "ID of the secret"
  value       = aws_secretsmanager_secret.main.id
}
