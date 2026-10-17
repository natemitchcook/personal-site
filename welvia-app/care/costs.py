"""Transparent, bounded per-business care unit economics. Rates are inputs, not claims."""
from decimal import Decimal
def estimate(*, evaluation_runs, input_tokens_per_run, output_tokens_per_run,
             input_usd_per_million, output_usd_per_million, fixed_variable_usd,
             labor_minutes=0, labor_hourly_usd=0, monthly_revenue_usd=50):
    if any(Decimal(str(x))<0 for x in (evaluation_runs,input_tokens_per_run,output_tokens_per_run,
       input_usd_per_million,output_usd_per_million,fixed_variable_usd,labor_minutes,labor_hourly_usd,monthly_revenue_usd)):
        raise ValueError("Negative costs or usage are invalid")
    d=lambda x:Decimal(str(x))
    token=(d(evaluation_runs)*(d(input_tokens_per_run)*d(input_usd_per_million)+
          d(output_tokens_per_run)*d(output_usd_per_million))/d(1000000))
    labor=d(labor_minutes)*d(labor_hourly_usd)/d(60)
    total=token+d(fixed_variable_usd)+labor
    return {"model_usd":str(token.quantize(d(".0001"))),"labor_usd":str(labor.quantize(d(".01"))),
            "total_usd":str(total.quantize(d(".01"))),
            "contribution_usd":str((d(monthly_revenue_usd)-total).quantize(d(".01"))),
            "exclusions":"Payment processing, email, fixed infrastructure, retries, search tools and tax unless included in supplied costs."}
